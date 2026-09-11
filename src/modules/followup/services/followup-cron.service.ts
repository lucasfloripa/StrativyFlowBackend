import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { FollowUpExecutor } from './followup-executor.service'

@Injectable()
export class FollowUpCron {
  private readonly logger = new Logger(FollowUpCron.name)

  constructor(private readonly followUpExecutor: FollowUpExecutor) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async processFollowUps(): Promise<void> {
    const now = new Date()

    this.logger.debug(`Running follow-up steps cron. now=${now.toISOString()}`)

    try {
      const processedCount = await this.followUpExecutor.processReadyWork(now)

      if (processedCount === 0) {
        this.logger.debug('No follow-up steps matched the execution window')
        return
      }

      this.logger.log(`Processed ${processedCount} follow-ups in current cycle`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error'
      const trace = error instanceof Error ? error.stack : undefined
      this.logger.error(
        `Failed to process follow-up cycle. error=${message}`,
        trace
      )
    }
  }
}

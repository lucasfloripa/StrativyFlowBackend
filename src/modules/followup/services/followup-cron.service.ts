import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { FollowUpExecutor } from './followup-executor.service'

@Injectable()
export class FollowUpCron {
  private readonly logger = new Logger(FollowUpCron.name)

  constructor(private readonly followUpExecutor: FollowUpExecutor) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processFollowUps(): Promise<void> {
    this.logger.debug('Starting follow-up processing cycle')

    const followUps = await this.followUpExecutor.findReadyForExecution()

    this.logger.log(`Found ${followUps.length} follow-ups ready for execution`)

    for (const followUp of followUps) {
      try {
        if (!(await this.followUpExecutor.canExecute(followUp))) {
          continue
        }

        await this.followUpExecutor.execute(followUp)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error'
        const trace = error instanceof Error ? error.stack : undefined

        this.logger.error(
          `Failed to process follow-up. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, templateId=${followUp.templateId ?? 'null'}, error=${message}`,
          trace
        )
      }
    }
  }
}

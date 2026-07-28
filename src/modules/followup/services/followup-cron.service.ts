import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../entities/followup.entity'
import { FollowUpExecutor } from './followup-executor.service'

@Injectable()
export class FollowUpCron {
  private readonly logger = new Logger(FollowUpCron.name)

  constructor(
    private readonly followUpExecutor: FollowUpExecutor,
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processFollowUps(): Promise<void> {
    this.logger.debug('Starting follow-up processing cycle')

    const followUps = await this.followUpExecutor.findReadyForExecution()

    this.logger.log(`Found ${followUps.length} follow-ups ready for execution`)

    const now = new Date()

    for (const followUp of followUps) {
      try {
        // Check if lead is in active conversation (within 24h)
        if (this.followUpExecutor.isLeadInActiveConversation(followUp, now)) {
          this.logger.log(
            `Skipping follow-up execution because lead is in active conversation. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, leadId=${followUp.negotiation?.leadId ?? 'null'}`
          )
          
          // Mark follow-up as skipped
          await this.followUpRepository.update(followUp.id, {
            status: FollowUpStatus.SKIPPED
          })

          continue
        }

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

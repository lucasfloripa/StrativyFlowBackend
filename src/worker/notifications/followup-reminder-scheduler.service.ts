import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import {
  FollowUpStep,
  FollowUpStepChannel,
  FollowUpStepType
} from '../../modules/followup/entities/followup-step.entity'
import {
  FollowUp,
  FollowUpStatus
} from '../../modules/followup/entities/followup.entity'
import { RabbitPublisherService } from '../../modules/rabbit/services/rabbit-publisher.service'
import { UserInformations } from '../../modules/user/entities/user-informations.entity'

import { FOLLOWUP_REMINDER_1H_EVENT } from './notification-job.constants'

export type FollowUpReminderCandidate = {
  followUpId: string
  followUpTitle: string
  actionChannel: FollowUpStepChannel | null
  actionType: FollowUpStepType | null
  userId: string
  leadName: string
  userInformationsId: string
}

@Injectable()
export class FollowUpReminderScheduler {
  private readonly logger = new Logger(FollowUpReminderScheduler.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rabbitPublisher: RabbitPublisherService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async scheduleOneHourFollowUpReminders(): Promise<void> {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

    this.logger.debug(
      `Running 1h follow-up reminder scheduler. windowStart=${now.toISOString()} windowEnd=${windowEnd.toISOString()}`
    )

    await this.dataSource.transaction(async (manager) => {
      const candidates = await manager
        .createQueryBuilder(FollowUp, 'followUp')
        .innerJoin('followUp.negotiation', 'negotiation')
        .innerJoin('negotiation.lead', 'lead')
        .innerJoin(
          UserInformations,
          'userInformations',
          '"userInformations"."id"::text = "lead"."userInformationsId"'
        )
        .select('followUp.id', 'followUpId')
        .addSelect('followUp.title', 'followUpTitle')
        .addSelect(
          (subQuery) =>
            subQuery
              .select('action.channel')
              .from(FollowUpStep, 'action')
              .where('action."followUpId" = followUp.id')
              .orderBy('action."createdAt"', 'ASC')
              .limit(1),
          'actionChannel'
        )
        .addSelect(
          (subQuery) =>
            subQuery
              .select('action.type')
              .from(FollowUpStep, 'action')
              .where('action."followUpId" = followUp.id')
              .orderBy('action."createdAt"', 'ASC')
              .limit(1),
          'actionType'
        )
        .addSelect('lead.name', 'leadName')
        .addSelect('userInformations.userId', 'userId')
        .addSelect('userInformations.id', 'userInformationsId')
        .where('"followUp"."status" = :pendingStatus', {
          pendingStatus: FollowUpStatus.PENDING
        })
        .andWhere('"followUp"."remider1hSentAt" IS NULL')
        .andWhere('"followUp"."reminder1hScheduledAt" IS NULL')
        .andWhere('"followUp"."dueAt" > :windowStart', { windowStart: now })
        .andWhere('"followUp"."dueAt" <= :windowEnd', { windowEnd })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getRawMany<FollowUpReminderCandidate>()

      if (candidates.length === 0) {
        this.logger.debug('No follow-ups matched the 1h reminder window')
        return
      }

      for (const candidate of candidates) {
        await manager.update(
          FollowUp,
          { id: candidate.followUpId },
          { reminder1hScheduledAt: now }
        )
        await this.rabbitPublisher.publish(
          FOLLOWUP_REMINDER_1H_EVENT,
          candidate
        )
      }

      this.logger.log(
        `Published ${FOLLOWUP_REMINDER_1H_EVENT} for ${candidates.length} follow-up(s)`
      )
    })
  }
}

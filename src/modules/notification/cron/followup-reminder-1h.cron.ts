import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import {
  FollowUp,
  FollowUpStatus
} from '../../followup/entities/followup.entity'
import { UserInformations } from '../../user/entities/user-informations.entity'
import {
  Notification,
  NotificationReferenceType,
  NotificationType
} from '../entities/notification.entity'

type FollowUpReminderCandidate = {
  followUpId: string
  userId: string
  leadName: string
}

@Injectable()
export class FollowUpReminder1hCron {
  private readonly logger = new Logger(FollowUpReminder1hCron.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('0 * * * * *')
  async sendOneHourFollowUpReminders(): Promise<void> {
    const now = new Date()
    const windowStart = now
    const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

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
        .addSelect('lead.name', 'leadName')
        .addSelect('userInformations.userId', 'userId')
        .where('"followUp"."status" = :pendingStatus', {
          pendingStatus: FollowUpStatus.PENDING
        })
        .andWhere('"followUp"."remider1hSentAt" IS NULL')
        .andWhere('"followUp"."dueAt" > :windowStart', { windowStart })
        .andWhere('"followUp"."dueAt" <= :windowEnd', { windowEnd })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getRawMany<FollowUpReminderCandidate>()

      if (!candidates.length) {
        return
      }

      for (const candidate of candidates) {
        await manager.insert(Notification, {
          organizationId: null,
          userId: candidate.userId,
          type: NotificationType.FOLLOW_UP_REMINDER_1H,
          title: 'Follow-up em 1 hora',
          description: `Retornar para ${candidate.leadName}`,
          referenceType: NotificationReferenceType.FOLLOW_UP,
          referenceId: candidate.followUpId,
          isRead: false,
          readAt: null
        })

        const updateResult = await manager.update(
          FollowUp,
          {
            id: candidate.followUpId
          },
          {
            reminder1hSentAt: now
          }
        )

        this.logger.log(
          `Marked reminder1hSentAt for follow-up ${candidate.followUpId}. Affected rows: ${updateResult.affected ?? 0}`
        )
      }

      this.logger.log(
        `Generated ${candidates.length} one-hour follow-up reminder notification(s)`
      )
    })
  }
}

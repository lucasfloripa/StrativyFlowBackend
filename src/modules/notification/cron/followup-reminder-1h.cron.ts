import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { AutomationMessagingService } from '../../automation/services/automation-messaging.service'
import {
  FollowUp,
  FollowUpStatus
} from '../../followup/entities/followup.entity'
import { MailService } from '../../mail/mail.service'
import { UserInformations } from '../../user/entities/user-informations.entity'
import {
  Notification,
  NotificationReferenceType,
  NotificationType
} from '../entities/notification.entity'
import {
  NotificationChannel,
  NotificationType as PreferenceNotificationType
} from '../enums'

type FollowUpReminderCandidate = {
  followUpId: string
  userId: string
  leadName: string
  userInformationsId: string
}

@Injectable()
export class FollowUpReminder1hCron {
  private readonly logger = new Logger(FollowUpReminder1hCron.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly automationMessagingService: AutomationMessagingService,
    private readonly mailService: MailService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendOneHourFollowUpReminders(): Promise<void> {
    const now = new Date()
    const windowStart = now
    const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

    this.logger.debug(
      `Running 1h follow-up reminder cron. windowStart=${windowStart.toISOString()} windowEnd=${windowEnd.toISOString()}`
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
        .addSelect('lead.name', 'leadName')
        .addSelect('userInformations.userId', 'userId')
        .addSelect('userInformations.id', 'userInformationsId')
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
        this.logger.debug('No follow-ups matched the 1h reminder window')
        return
      }

      for (const candidate of candidates) {
        const userInformations = await manager.findOne(UserInformations, {
          where: { id: candidate.userInformationsId }
        })

        const enabledChannels =
          userInformations?.notificationPreferences?.[
            PreferenceNotificationType.FOLLOWUP_ONE_HOUR
          ] ?? []

        if (enabledChannels.includes(NotificationChannel.APP)) {
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
        } else {
          this.logger.log(
            `Skipping APP follow-up 1h reminder because APP channel is disabled for userId=${candidate.userId}`
          )
        }

        if (enabledChannels.includes(NotificationChannel.WHATSAPP)) {
          const recipients = Array.from(
            new Set(
              (userInformations?.notificationWhatsAppNumbers ?? [])
                .map((number) => number.trim())
                .filter((number) => number.length > 0)
            )
          )

          if (!recipients.length) {
            this.logger.warn(
              `Skipping WHATSAPP follow-up 1h reminder because no recipient numbers are configured for userId=${candidate.userId}`
            )
          } else {
            const phoneNumberId = userInformations?.phoneNumberId?.trim()

            if (!phoneNumberId) {
              this.logger.warn(
                `Skipping WHATSAPP follow-up 1h reminder because phoneNumberId is missing for userId=${candidate.userId}`
              )
            } else {
              const notificationMessage = `Follow-up em 1 hora: Retornar para ${candidate.leadName}`

              const results = await Promise.allSettled(
                recipients.map((recipient) =>
                  this.automationMessagingService.sendWhatsAppMessage(
                    recipient,
                    notificationMessage,
                    phoneNumberId,
                    userInformations?.whatsappToken ?? undefined
                  )
                )
              )

              const successCount = results.filter(
                (result) => result.status === 'fulfilled'
              ).length

              this.logger.log(
                `WHATSAPP follow-up 1h reminder dispatch finished for userId=${candidate.userId}, followUpId=${candidate.followUpId}. success=${successCount}/${recipients.length}`
              )

              results.forEach((result, index) => {
                if (result.status === 'rejected') {
                  this.logger.warn(
                    `Failed to send WHATSAPP follow-up 1h reminder to ${recipients[index]} for followUpId=${candidate.followUpId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
                  )
                }
              })
            }
          }
        } else {
          this.logger.log(
            `Skipping WHATSAPP follow-up 1h reminder because WHATSAPP channel is disabled for userId=${candidate.userId}`
          )
        }

        if (enabledChannels.includes(NotificationChannel.EMAIL)) {
          const recipients = Array.from(
            new Set(
              (userInformations?.notificationEmails ?? [])
                .map((email) => email.trim().toLowerCase())
                .filter((email) => email.length > 0)
            )
          )

          if (!recipients.length) {
            this.logger.warn(
              `Skipping EMAIL follow-up 1h reminder because no notificationEmails are configured for userId=${candidate.userId}`
            )
          } else {
            await this.mailService.send({
              from: 'Strativy Flow <no-reply@strativyflow.com>',
              to: recipients,
              subject: 'Follow-up em 1 hora',
              html: [
                '<h2>Follow-up em 1 hora</h2>',
                `<p>Retornar para ${this.escapeHtml(candidate.leadName)}</p>`
              ].join('')
            })

            this.logger.log(
              `EMAIL follow-up 1h reminder sent for userId=${candidate.userId}, followUpId=${candidate.followUpId}, recipients=${recipients.length}`
            )
          }
        } else {
          this.logger.log(
            `Skipping EMAIL follow-up 1h reminder because EMAIL channel is disabled for userId=${candidate.userId}`
          )
        }

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

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
}

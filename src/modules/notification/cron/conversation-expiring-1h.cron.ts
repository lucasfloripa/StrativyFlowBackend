import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { EvolutionService } from '../../evolution/evolution.service'
import { Lead } from '../../leads/entities/lead.entity'
import { MailService } from '../../mail/mail.service'
import { buildConversationExpiringEmail } from '../../mail/templates/notification-email.templates'
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

type ConversationExpiringCandidate = {
  leadId: string
  userId: string
  leadName: string
  userInformationsId: string
}

@Injectable()
export class ConversationExpiring1hCron {
  private readonly logger = new Logger(ConversationExpiring1hCron.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly evolutionService: EvolutionService,
    private readonly mailService: MailService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendConversationExpiringReminders(): Promise<void> {
    const now = new Date()
    const windowStart = now
    const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

    // Expiration window: lastInboundMessageAt + 24h
    // We want: expirationAt > now AND expirationAt <= now + 1h
    // i.e.: lastInboundMessageAt + 24h > now  AND  lastInboundMessageAt + 24h <= now + 1h
    // i.e.: lastInboundMessageAt > now - 24h  AND  lastInboundMessageAt <= now + 1h - 24h
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    this.logger.debug(
      `Running conversation expiring 1h cron. windowStart=${windowStart.toISOString()} windowEnd=${windowEnd.toISOString()}`
    )

    await this.dataSource.transaction(async (manager) => {
      const candidates = await manager
        .createQueryBuilder(Lead, 'lead')
        .innerJoin(
          UserInformations,
          'userInformations',
          '"userInformations"."id"::text = "lead"."userInformationsId"'
        )
        .select('lead.id', 'leadId')
        .addSelect('lead.name', 'leadName')
        .addSelect('userInformations.userId', 'userId')
        .addSelect('userInformations.id', 'userInformationsId')
        .where('lead."lastActivityAt" IS NOT NULL')
        .andWhere('lead."conversationReminder1hSentAt" IS NULL')
        // lastActivityAt > now - 24h (not yet expired)
        .andWhere('lead."lastActivityAt" > :twentyFourHoursAgo', {
          twentyFourHoursAgo
        })
        // lastActivityAt <= now - 23h (within the 1h warning window)
        .andWhere('lead."lastActivityAt" <= :twentyThreeHoursAgo', {
          twentyThreeHoursAgo
        })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getRawMany<ConversationExpiringCandidate>()

      if (!candidates.length) {
        this.logger.debug(
          'No conversations matched the expiring 1h reminder window'
        )
        return
      }

      for (const candidate of candidates) {
        const userInformations = await manager.findOne(UserInformations, {
          where: { id: candidate.userInformationsId }
        })

        const enabledChannels =
          userInformations?.notificationPreferences?.[
            PreferenceNotificationType.CONVERSATION_EXPIRING_1H
          ] ?? []

        if (enabledChannels.includes(NotificationChannel.APP)) {
          await manager.insert(Notification, {
            organizationId: null,
            userId: candidate.userId,
            type: NotificationType.CONVERSATION_EXPIRING_1H,
            title: 'Conversa expirando em 1 hora',
            description: `A janela de atendimento de ${candidate.leadName} expira em breve`,
            referenceType: NotificationReferenceType.FOLLOW_UP,
            referenceId: candidate.leadId,
            isRead: false,
            readAt: null
          })
        } else {
          this.logger.log(
            `Skipping APP conversation expiring reminder because APP channel is disabled for userId=${candidate.userId}`
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
              `Skipping WHATSAPP conversation expiring reminder because no recipient numbers are configured for userId=${candidate.userId}`
            )
          } else {
            const notificationMessage = `Atenção: a janela de atendimento de ${candidate.leadName} expira em menos de 1 hora`

            const results = await Promise.allSettled(
              recipients.map((recipient) =>
                this.evolutionService.sendText(recipient, notificationMessage)
              )
            )

            const successCount = results.filter(
              (result) => result.status === 'fulfilled'
            ).length

            this.logger.log(
              `WHATSAPP conversation expiring reminder dispatch finished for userId=${candidate.userId}, leadId=${candidate.leadId}. success=${successCount}/${recipients.length}`
            )

            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                this.logger.warn(
                  `Failed to send WHATSAPP conversation expiring reminder to ${recipients[index]} for leadId=${candidate.leadId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
                )
              }
            })
          }
        } else {
          this.logger.log(
            `Skipping WHATSAPP conversation expiring reminder because WHATSAPP channel is disabled for userId=${candidate.userId}`
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
              `Skipping EMAIL conversation expiring reminder because no notificationEmails are configured for userId=${candidate.userId}`
            )
          } else {
            await this.mailService.send({
              from: 'Strativy Flow <no-reply@strativyflow.com>',
              to: recipients,
              subject: 'Conversa expirando em 1 hora',
              html: buildConversationExpiringEmail(candidate.leadName)
            })

            this.logger.log(
              `EMAIL conversation expiring reminder sent for userId=${candidate.userId}, leadId=${candidate.leadId}, recipients=${recipients.length}`
            )
          }
        } else {
          this.logger.log(
            `Skipping EMAIL conversation expiring reminder because EMAIL channel is disabled for userId=${candidate.userId}`
          )
        }

        await manager.update(
          Lead,
          { id: candidate.leadId },
          { conversationReminder1hSentAt: now }
        )

        this.logger.log(
          `Marked conversationReminder1hSentAt for lead ${candidate.leadId}`
        )
      }

      this.logger.log(
        `Generated ${candidates.length} conversation expiring reminder notification(s)`
      )
    })
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { EvolutionService } from '../../evolution/evolution.service'
import { Lead } from '../../leads/entities/lead.entity'
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

type ConversationExpiredCandidate = {
  leadId: string
  userId: string
  leadName: string
  userInformationsId: string
}

@Injectable()
export class ConversationExpiredCron {
  private readonly logger = new Logger(ConversationExpiredCron.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly evolutionService: EvolutionService,
    private readonly mailService: MailService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendConversationExpiredNotifications(): Promise<void> {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    this.logger.debug(
      `Running conversation expired cron. now=${now.toISOString()}`
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
        .andWhere('lead."conversationExpiredNotificationSentAt" IS NULL')
        // lastActivityAt <= now - 24h (conversation has expired)
        .andWhere('lead."lastActivityAt" <= :twentyFourHoursAgo', {
          twentyFourHoursAgo
        })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getRawMany<ConversationExpiredCandidate>()

      if (!candidates.length) {
        this.logger.debug('No conversations matched the expired window')
        return
      }

      for (const candidate of candidates) {
        const userInformations = await manager.findOne(UserInformations, {
          where: { id: candidate.userInformationsId }
        })

        const enabledChannels =
          userInformations?.notificationPreferences?.[
            PreferenceNotificationType.CONVERSATION_EXPIRED
          ] ?? []

        if (enabledChannels.includes(NotificationChannel.APP)) {
          await manager.insert(Notification, {
            organizationId: null,
            userId: candidate.userId,
            type: NotificationType.CONVERSATION_EXPIRED,
            title: 'Conversa expirada',
            description: `A conversa com ${candidate.leadName} saiu da janela de atendimento. Agora será necessário enviar um template para retomar o contato.`,
            referenceType: NotificationReferenceType.FOLLOW_UP,
            referenceId: candidate.leadId,
            isRead: false,
            readAt: null
          })
        } else {
          this.logger.log(
            `Skipping APP conversation expired notification because APP channel is disabled for userId=${candidate.userId}`
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
              `Skipping WHATSAPP conversation expired notification because no recipient numbers are configured for userId=${candidate.userId}`
            )
          } else {
            const notificationMessage = `A conversa com ${candidate.leadName} saiu da janela de atendimento de 24 horas.\n\nAgora será necessário enviar um template para continuar a conversa.`

            const results = await Promise.allSettled(
              recipients.map((recipient) =>
                this.evolutionService.sendText(recipient, notificationMessage)
              )
            )

            const successCount = results.filter(
              (result) => result.status === 'fulfilled'
            ).length

            this.logger.log(
              `WHATSAPP conversation expired notification dispatch finished for userId=${candidate.userId}, leadId=${candidate.leadId}. success=${successCount}/${recipients.length}`
            )

            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                this.logger.warn(
                  `Failed to send WHATSAPP conversation expired notification to ${recipients[index]} for leadId=${candidate.leadId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
                )
              }
            })
          }
        } else {
          this.logger.log(
            `Skipping WHATSAPP conversation expired notification because WHATSAPP channel is disabled for userId=${candidate.userId}`
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
              `Skipping EMAIL conversation expired notification because no notificationEmails are configured for userId=${candidate.userId}`
            )
          } else {
            await this.mailService.send({
              from: 'Strativy Flow <no-reply@strativyflow.com>',
              to: recipients,
              subject: 'Conversa expirada',
              html: [
                '<h2>Conversa expirada</h2>',
                `<p>A conversa com <strong>${this.escapeHtml(candidate.leadName)}</strong> saiu da janela de atendimento.</p>`,
                '<p>Agora será necessário enviar um template para retomar o contato.</p>'
              ].join('')
            })

            this.logger.log(
              `EMAIL conversation expired notification sent for userId=${candidate.userId}, leadId=${candidate.leadId}, recipients=${recipients.length}`
            )
          }
        } else {
          this.logger.log(
            `Skipping EMAIL conversation expired notification because EMAIL channel is disabled for userId=${candidate.userId}`
          )
        }

        await manager.update(
          Lead,
          { id: candidate.leadId },
          { conversationExpiredNotificationSentAt: now }
        )

        this.logger.log(
          `Marked conversationExpiredNotificationSentAt for lead ${candidate.leadId}`
        )
      }

      this.logger.log(
        `Generated ${candidates.length} conversation expired notification(s)`
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

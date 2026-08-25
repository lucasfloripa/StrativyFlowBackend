import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { EvolutionService } from '../../evolution/evolution.service'
import { MailService } from '../../mail/mail.service'
import { buildNewLeadEmail } from '../../mail/templates/notification-email.templates'
import { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'
import { UserInformations } from '../../user/entities/user-informations.entity'
import {
  NotificationReferenceType,
  NotificationType
} from '../entities/notification.entity'
import {
  NotificationChannel,
  NotificationType as PreferenceNotificationType
} from '../enums'
import { NotificationService } from '../notification.service'

import { NotificationEventHandler } from './notification-event-handler.interface'

@Injectable()
export class LeadCreatedHandler implements NotificationEventHandler {
  readonly event = 'lead.created' as const

  private readonly logger = new Logger(LeadCreatedHandler.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly evolutionService: EvolutionService,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async handle(message: RabbitMessage): Promise<void> {
    const data = this.asRecord(message.data)
    const userId = this.getString(data, 'userId')
    const leadId = this.getString(data, 'leadId')
    const leadName = this.getString(data, 'leadName')
    const description = this.getString(data, 'description') ?? leadName
    const origin = this.getString(data, 'origin')
    const firstContactAt =
      this.getDate(data, 'createdAt') ?? this.parseDate(message.occurredAt)

    if (!userId || !leadId) {
      this.logger.warn(
        'Skipping lead.created notification due to invalid payload'
      )
      return
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId },
      order: { createdAt: 'ASC' }
    })

    const enabledChannels =
      userInformations?.notificationPreferences?.[
        PreferenceNotificationType.NEW_LEAD
      ] ?? []

    this.logger.log(
      `Processing lead.created for userId=${userId}, leadId=${leadId}, origin=${origin ?? 'unknown'}, channels=${enabledChannels.join(',') || 'none'}`
    )

    if (!this.hasValidLeadName(leadName) || !description) {
      this.logger.log(
        `Skipping lead.created notification because lead name is not valid yet. leadId=${leadId}`
      )
      return
    }

    // Only create in-app notification for leads created via webhook
    if (
      origin === 'webhook' &&
      enabledChannels.includes(NotificationChannel.APP)
    ) {
      await this.notificationService.createNotification({
        organizationId: this.getString(data, 'organizationId') ?? null,
        userId,
        type: NotificationType.LEAD_CREATED,
        title: 'Novo lead criado',
        description,
        referenceType: NotificationReferenceType.LEAD,
        referenceId: leadId
      })
    } else if (origin !== 'webhook') {
      this.logger.log(
        `Skipping in-app lead.created notification because lead was created via app (origin=${origin ?? 'unknown'}), not webhook. leadId=${leadId}`
      )
    } else {
      this.logger.log(
        `Skipping in-app lead.created notification because APP channel is disabled for userId=${userId}`
      )
    }

    if (
      origin === 'webhook' &&
      enabledChannels.includes(NotificationChannel.WHATSAPP)
    ) {
      await this.dispatchWhatsAppNotification({
        userId,
        leadId,
        userInformations
      })
    } else if (origin !== 'webhook') {
      this.logger.log(
        `Skipping NEW_LEAD WhatsApp notification because lead was created via app (origin=${origin ?? 'unknown'}), not webhook. leadId=${leadId}`
      )
    } else {
      this.logger.log(
        `Skipping NEW_LEAD WhatsApp notification because WHATSAPP channel is disabled for userId=${userId}`
      )
    }

    if (
      origin === 'webhook' &&
      enabledChannels.includes(NotificationChannel.EMAIL)
    ) {
      const recipients = Array.from(
        new Set(
          (userInformations?.notificationEmails ?? [])
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.length > 0)
        )
      )

      if (recipients.length > 0) {
        this.logger.log(
          `Sending NEW_LEAD email notification for userId=${userId} to ${recipients.length} recipient(s)`
        )
        await this.mailService.send({
          from: 'Strativy Flow <no-reply@strativyflow.com>',
          to: recipients,
          subject: 'Novo lead criado',
          html: buildNewLeadEmail({
            leadName: leadName ?? description,
            firstContactAt
          })
        })
        this.logger.log(
          `NEW_LEAD email notification sent for userId=${userId}, leadId=${leadId}`
        )
      } else {
        this.logger.warn(
          `Skipping NEW_LEAD email notification because no notificationEmails are configured for userId=${userId}`
        )
      }
    } else if (origin !== 'webhook') {
      this.logger.log(
        `Skipping NEW_LEAD email notification because lead was created via app (origin=${origin ?? 'unknown'}), not webhook. leadId=${leadId}`
      )
    } else {
      this.logger.log(
        `Skipping NEW_LEAD email notification because EMAIL channel is disabled for userId=${userId}`
      )
    }
  }

  private async dispatchWhatsAppNotification(params: {
    userId: string
    leadId: string
    userInformations: UserInformations | null
  }): Promise<void> {
    const { userId, leadId, userInformations } = params
    const recipients = Array.from(
      new Set(
        (userInformations?.notificationWhatsAppNumbers ?? [])
          .map((number) => number.trim())
          .filter((number) => number.length > 0)
      )
    )

    if (!recipients.length) {
      this.logger.warn(
        `Skipping NEW_LEAD WhatsApp notification because no notificationWhatsAppNumbers are configured for userId=${userId}`
      )
      return
    }

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.evolutionService.sendText(recipient, 'Tem novo Lead no Flow!')
      )
    )
    const successCount = results.filter(
      (result) => result.status === 'fulfilled'
    ).length

    this.logger.log(
      `NEW_LEAD WhatsApp notification dispatched for leadId=${leadId}. success=${successCount}/${recipients.length}`
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Failed to send NEW_LEAD WhatsApp notification to ${recipients[index]} for leadId=${leadId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
        )
      }
    })
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>
    }

    return {}
  }

  private getString(
    payload: Record<string, unknown>,
    key: string
  ): string | null {
    const raw = payload[key]

    if (typeof raw !== 'string') {
      return null
    }

    const normalized = raw.trim()
    return normalized ? normalized : null
  }

  private getDate(
    payload: Record<string, unknown>,
    key: string
  ): Date | undefined {
    return this.parseDate(payload[key])
  }

  private parseDate(raw: unknown): Date | undefined {
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? undefined : raw
    }

    if (typeof raw !== 'string' && typeof raw !== 'number') {
      return undefined
    }

    const date = new Date(raw)

    return Number.isNaN(date.getTime()) ? undefined : date
  }

  private hasValidLeadName(leadName: string | null): boolean {
    if (!leadName) {
      return false
    }

    const normalized = leadName.trim().toLowerCase()

    if (!normalized) {
      return false
    }

    return !normalized.includes('sem nome') && !normalized.includes('sem nova')
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { MailService } from '../../mail/mail.service'
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
    if (origin === 'webhook' && enabledChannels.includes(NotificationChannel.APP)) {
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

    if (origin === 'webhook' && enabledChannels.includes(NotificationChannel.EMAIL)) {
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
          html: `<h2>Novo lead criado</h2><p>${this.escapeHtml(description)}</p>`
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

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
}

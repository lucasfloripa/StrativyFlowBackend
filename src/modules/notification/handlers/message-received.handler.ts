import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AutomationMessagingService } from '../../automation/services/automation-messaging.service'
import { Message, MessageDirection } from '../../leads/entities/message.entity'
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
export class MessageReceivedHandler implements NotificationEventHandler {
  readonly event = 'message.received' as const

  private readonly logger = new Logger(MessageReceivedHandler.name)
  private readonly notificationWindowMs = 30 * 60 * 1000

  constructor(
    private readonly notificationService: NotificationService,
    private readonly automationMessagingService: AutomationMessagingService,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>
  ) {}

  async handle(message: RabbitMessage): Promise<void> {
    const data = this.asRecord(message.data)
    const userId = this.getString(data, 'userId')
    const messageId = this.getString(data, 'messageId')
    const leadId = this.getString(data, 'leadId')
    const leadName = this.getString(data, 'leadName')

    this.logger.log(
      `Received message.received event: userId=${userId ?? 'null'}, messageId=${messageId ?? 'null'}, leadId=${leadId ?? 'null'}, leadName=${leadName ?? 'null'}`
    )

    if (!userId || !messageId || !leadId) {
      this.logger.warn(
        'Skipping message.received notification due to invalid payload'
      )
      return
    }

    const description =
      this.getString(data, 'description') ??
      leadName ??
      'Nova mensagem recebida.'

    await this.notificationService.createNotification({
      organizationId: this.getString(data, 'organizationId') ?? null,
      userId,
      type: NotificationType.MESSAGE_RECEIVED,
      title: 'Nova mensagem recebida',
      description,
      referenceType: NotificationReferenceType.MESSAGE,
      referenceId: leadId
    })

    await this.dispatchWhatsAppMessageReceivedNotification({
      userId,
      messageId,
      leadId,
      leadName
    })
  }

  private async dispatchWhatsAppMessageReceivedNotification(params: {
    userId: string
    messageId: string
    leadId: string
    leadName: string | null
  }): Promise<void> {
    const { userId, messageId, leadId, leadName } = params

    if (!this.hasValidLeadName(leadName)) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because lead name is not valid yet. leadId=${leadId}`
      )
      return
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId },
      order: { createdAt: 'ASC' }
    })

    if (!userInformations) {
      this.logger.warn(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because UserInformations was not found for userId=${userId}`
      )
      return
    }

    const enabledChannels =
      userInformations?.notificationPreferences?.[
        PreferenceNotificationType.MESSAGE_RECEIVED
      ] ?? []

    this.logger.log(
      `MESSAGE_RECEIVED channels for userId=${userId}: ${enabledChannels.join(',') || 'none'}`
    )

    if (!enabledChannels.includes(NotificationChannel.WHATSAPP)) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because WHATSAPP channel is disabled for userId=${userId}`
      )
      return
    }

    const recipients = Array.from(
      new Set(
        (userInformations?.notificationWhatsAppNumbers ?? [])
          .map((number) => number.trim())
          .filter((number) => number.length > 0)
      )
    )

    this.logger.log(
      `MESSAGE_RECEIVED recipients for userId=${userId}: count=${recipients.length}`
    )

    if (!recipients.length) {
      this.logger.warn(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because no notificationWhatsAppNumbers are configured for userId=${userId}`
      )
      return
    }

    const currentMessage = await this.messageRepo.findOne({
      where: {
        id: messageId,
        leadId,
        direction: MessageDirection.INBOUND
      }
    })

    if (!currentMessage) {
      this.logger.warn(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because inbound message was not found. messageId=${messageId}`
      )
      return
    }

    const windowStart = new Date(
      currentMessage.createdAt.getTime() - this.notificationWindowMs
    )

    this.logger.log(
      `MESSAGE_RECEIVED dedup window for leadId=${leadId}, messageId=${messageId}: windowStart=${windowStart.toISOString()}, currentCreatedAt=${currentMessage.createdAt.toISOString()}`
    )

    const recentNotifiedMessage = await this.messageRepo
      .createQueryBuilder('message')
      .where('message."leadId" = :leadId', { leadId })
      .andWhere('message."direction" = :direction', {
        direction: MessageDirection.INBOUND
      })
      .andWhere('message."createdAt" >= :windowStart', { windowStart })
      .andWhere('message."createdAt" < :currentCreatedAt', {
        currentCreatedAt: currentMessage.createdAt
      })
      .andWhere(
        "message.metadata->>'messageReceivedWhatsAppNotifiedAt' IS NOT NULL"
      )
      .orderBy('message."createdAt"', 'DESC')
      .getOne()

    if (recentNotifiedMessage) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because a notification was already sent in the last 30 minutes. leadId=${leadId}, messageId=${messageId}`
      )
      return
    }

    const phoneNumberId =
      userInformations?.phoneNumberId?.trim() ||
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()

    this.logger.log(
      `MESSAGE_RECEIVED phoneNumberId resolved for userId=${userId}: ${phoneNumberId ? 'configured' : 'missing'}`
    )

    if (!phoneNumberId) {
      this.logger.warn(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because phoneNumberId is missing for userId=${userId}`
      )
      return
    }

    const notificationMessage = `Lead ${leadName} mandou mensagem no Flow!`

    this.logger.log(
      `Dispatching MESSAGE_RECEIVED WhatsApp notification for leadId=${leadId} to ${recipients.length} recipient(s)`
    )

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.automationMessagingService.sendWhatsAppMessage(
          recipient,
          notificationMessage,
          phoneNumberId
        )
      )
    )

    const successCount = results.filter(
      (result) => result.status === 'fulfilled'
    ).length

    if (successCount === 0) {
      this.logger.warn(
        `MESSAGE_RECEIVED WhatsApp notification failed for all recipients. leadId=${leadId}, messageId=${messageId}`
      )
      return
    }

    currentMessage.metadata = {
      ...(currentMessage.metadata ?? {}),
      messageReceivedWhatsAppNotifiedAt: new Date().toISOString()
    }

    await this.messageRepo.save(currentMessage)

    this.logger.log(
      `MESSAGE_RECEIVED WhatsApp notification sent for leadId=${leadId}, messageId=${messageId}. success=${successCount}/${recipients.length}`
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Failed to send MESSAGE_RECEIVED WhatsApp notification to ${recipients[index]} for leadId=${leadId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
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

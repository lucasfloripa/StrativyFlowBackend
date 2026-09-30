import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { EvolutionService } from '../../modules/evolution/evolution.service'
import {
  FollowUpStepChannel,
  FollowUpStepType
} from '../../modules/followup/entities/followup-step.entity'
import { FollowUp } from '../../modules/followup/entities/followup.entity'
import { Lead, LeadFlowState } from '../../modules/leads/entities/lead.entity'
import {
  Message,
  MessageDirection
} from '../../modules/leads/entities/message.entity'
import { MailService } from '../../modules/mail/mail.service'
import { buildFollowUpOneHourEmail } from '../../modules/mail/templates/notification-email.templates'
import {
  NotificationReferenceType,
  NotificationType
} from '../../modules/notification/entities/notification.entity'
import {
  NotificationChannel,
  NotificationType as PreferenceNotificationType
} from '../../modules/notification/enums'
import { NotificationService } from '../../modules/notification/notification.service'
import { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'
import { RabbitConsumerService } from '../../modules/rabbit/services/rabbit-consumer.service'
import { UserInformations } from '../../modules/user/entities/user-informations.entity'

import {
  FOLLOWUP_REMINDER_1H_EVENT,
  FOLLOWUP_REMINDER_1H_QUEUE,
  LEAD_CREATED_EVENT,
  MESSAGE_RECEIVED_EVENT,
  MESSAGE_RECEIVED_QUEUE,
  NOTIFICATION_QUEUE
} from './notification-job.constants'

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name)
  private readonly notificationWindowMs = 30 * 60 * 1000

  constructor(
    private readonly rabbitConsumer: RabbitConsumerService,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly evolutionService: EvolutionService,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumer.subscribe({
      queue: NOTIFICATION_QUEUE,
      routingKey: LEAD_CREATED_EVENT,
      handler: (message) => this.handleLeadCreatedEvent(message)
    })

    await this.rabbitConsumer.subscribe({
      queue: MESSAGE_RECEIVED_QUEUE,
      routingKey: MESSAGE_RECEIVED_EVENT,
      handler: (message) => this.handleMessageReceivedEvent(message)
    })

    await this.rabbitConsumer.subscribe({
      queue: FOLLOWUP_REMINDER_1H_QUEUE,
      routingKey: FOLLOWUP_REMINDER_1H_EVENT,
      handler: (message) => this.handleFollowUpReminder1hEvent(message)
    })

    this.logger.log(
      `Listening on ${NOTIFICATION_QUEUE}, ${MESSAGE_RECEIVED_QUEUE} and ${FOLLOWUP_REMINDER_1H_QUEUE}`
    )
  }

  private async handleFollowUpReminder1hEvent(
    message: RabbitMessage
  ): Promise<void> {
    if (message.event !== FOLLOWUP_REMINDER_1H_EVENT) {
      throw new Error(`Unsupported notification event: ${message.event}`)
    }

    const data = this.asRecord(message.data)
    const followUpId = this.getString(data, 'followUpId')
    const followUpTitle = this.getString(data, 'followUpTitle')
    const userId = this.getString(data, 'userId')
    const leadName = this.getString(data, 'leadName')
    const userInformationsId = this.getString(data, 'userInformationsId')
    const actionChannel = this.getOptionalFollowUpStepChannel(
      data,
      'actionChannel'
    )
    const actionType = this.getOptionalFollowUpStepType(data, 'actionType')

    if (
      !followUpId ||
      !followUpTitle ||
      !userId ||
      !leadName ||
      !userInformationsId
    ) {
      throw new Error(
        'followup.reminder.1h requires followUpId, followUpTitle, userId, leadName and userInformationsId'
      )
    }

    this.logger.log(
      `Received job: ${message.event} (eventId=${message.eventId}, followUpId=${followUpId})`
    )

    const followUp = await this.followUpRepo.findOne({
      where: { id: followUpId }
    })

    if (!followUp) {
      this.logger.warn(
        `Skipping follow-up 1h reminder because follow-up was not found. followUpId=${followUpId}`
      )
      return
    }

    if (followUp.reminder1hSentAt) {
      this.logger.log(
        `Skipping follow-up 1h reminder because it was already processed. followUpId=${followUpId}`
      )
      return
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { id: userInformationsId }
    })
    const enabledChannels =
      userInformations?.notificationPreferences?.[
        PreferenceNotificationType.FOLLOWUP_ONE_HOUR
      ] ?? []
    const candidate = {
      followUpTitle,
      actionChannel,
      actionType,
      leadName
    }
    const actionLabel = this.getFollowUpActionLabel(candidate)
    const reminderDescription = this.buildFollowUpReminderDescription(candidate)

    if (enabledChannels.includes(NotificationChannel.APP)) {
      await this.notificationService.createNotification({
        organizationId: null,
        userId,
        type: NotificationType.FOLLOW_UP_REMINDER_1H,
        title: 'Follow-up em 1 hora',
        description: reminderDescription,
        referenceType: NotificationReferenceType.FOLLOW_UP,
        referenceId: followUpId
      })
    } else {
      this.logger.log(
        `Skipping APP follow-up 1h reminder because APP channel is disabled for userId=${userId}`
      )
    }

    await this.dispatchFollowUpReminderWhatsApp({
      userId,
      followUpId,
      reminderDescription,
      userInformations,
      enabledChannels
    })

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
          `Skipping EMAIL follow-up 1h reminder because no notificationEmails are configured for userId=${userId}`
        )
      } else {
        await this.mailService.send({
          from: 'Strativy Flow <no-reply@strativyflow.com>',
          to: recipients,
          subject: 'Follow-up em 1 hora',
          html: buildFollowUpOneHourEmail({
            followUpTitle,
            leadName,
            channelLabel: actionLabel
          })
        })

        this.logger.log(
          `EMAIL follow-up 1h reminder sent for userId=${userId}, followUpId=${followUpId}, recipients=${recipients.length}`
        )
      }
    } else {
      this.logger.log(
        `Skipping EMAIL follow-up 1h reminder because EMAIL channel is disabled for userId=${userId}`
      )
    }

    followUp.reminder1hSentAt = new Date()
    await this.followUpRepo.save(followUp)

    this.logger.log(
      `Job ${message.event} completed (followUpId=${followUpId}, userId=${userId})`
    )
  }

  private async handleMessageReceivedEvent(
    message: RabbitMessage
  ): Promise<void> {
    this.logger.log(
      `Received job: ${message.event} message=${JSON.stringify(message)}`
    )

    const data = this.asRecord(message.data)
    const userId = this.getString(data, 'userId')
    const messageId = this.getString(data, 'messageId')
    const leadId = this.getString(data, 'leadId')
    const leadName = this.getString(data, 'leadName')

    if (!userId || !messageId || !leadId) {
      this.logger.warn(
        'Skipping message.received notification due to invalid payload'
      )
      return
    }

    const lead = await this.leadRepo.findOne({ where: { id: leadId } })

    if (!lead || lead.flowState !== LeadFlowState.IN_CONVERSATION) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED notifications until lead reaches IN_CONVERSATION. leadId=${leadId}, flowState=${lead?.flowState ?? 'unknown'}`
      )
      return
    }

    const description =
      this.getString(data, 'description') ??
      leadName ??
      'Nova mensagem recebida.'

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId },
      order: { createdAt: 'ASC' }
    })

    if (!userInformations) {
      this.logger.warn(
        `Skipping MESSAGE_RECEIVED notifications because UserInformations was not found for userId=${userId}`
      )
      return
    }

    const enabledChannels =
      userInformations.notificationPreferences?.[
        PreferenceNotificationType.MESSAGE_RECEIVED
      ] ?? []

    this.logger.log(
      `MESSAGE_RECEIVED channels for userId=${userId}: ${enabledChannels.join(',') || 'none'}`
    )

    if (enabledChannels.includes(NotificationChannel.APP)) {
      await this.notificationService.createNotification({
        organizationId: this.getString(data, 'organizationId') ?? null,
        userId,
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'Nova mensagem recebida',
        description,
        referenceType: NotificationReferenceType.MESSAGE,
        referenceId: leadId
      })
    } else {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED APP notification because APP channel is disabled for userId=${userId}`
      )
    }

    await this.dispatchWhatsAppMessageReceivedNotification({
      userId,
      messageId,
      leadId,
      leadName,
      userInformations,
      enabledChannels
    })
  }

  private async handleLeadCreatedEvent(message: RabbitMessage): Promise<void> {
    if (message.event !== LEAD_CREATED_EVENT) {
      throw new Error(`Unsupported notification event: ${message.event}`)
    }

    const leadId = this.getLeadId(message.data)
    const data = this.asRecord(message.data)
    const userId = this.getString(data, 'userId')

    this.logger.log(
      `Received job: ${message.event} (eventId=${message.eventId}, leadId=${leadId})`
    )

    try {
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
            html: this.buildNewLeadEmail({
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

      this.logger.log(
        `Job ${message.event} completed (leadId=${leadId}, userId=${userId})`
      )
    } catch (error) {
      this.logger.error(
        `Job ${message.event} failed (leadId=${leadId}, userId=${userId ?? 'unknown'}, error=${error instanceof Error ? error.message : String(error)})`,
        error instanceof Error ? error.stack : undefined
      )
      throw error
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

  private async dispatchFollowUpReminderWhatsApp(params: {
    userId: string
    followUpId: string
    reminderDescription: string
    userInformations: UserInformations | null
    enabledChannels: NotificationChannel[]
  }): Promise<void> {
    const {
      userId,
      followUpId,
      reminderDescription,
      userInformations,
      enabledChannels
    } = params

    if (!enabledChannels.includes(NotificationChannel.WHATSAPP)) {
      this.logger.log(
        `Skipping WHATSAPP follow-up 1h reminder because WHATSAPP channel is disabled for userId=${userId}`
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

    if (!recipients.length) {
      this.logger.warn(
        `Skipping WHATSAPP follow-up 1h reminder because no recipient numbers are configured for userId=${userId}`
      )
      return
    }

    const notificationMessage = `Follow-up em 1 hora: ${reminderDescription}`
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.evolutionService.sendText(recipient, notificationMessage)
      )
    )
    const successCount = results.filter(
      (result) => result.status === 'fulfilled'
    ).length

    this.logger.log(
      `WHATSAPP follow-up 1h reminder dispatch finished for userId=${userId}, followUpId=${followUpId}. success=${successCount}/${recipients.length}`
    )

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Failed to send WHATSAPP follow-up 1h reminder to ${recipients[index]} for followUpId=${followUpId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
        )
      }
    })
  }

  private async dispatchWhatsAppMessageReceivedNotification(params: {
    userId: string
    messageId: string
    leadId: string
    leadName: string | null
    userInformations: UserInformations
    enabledChannels: NotificationChannel[]
  }): Promise<void> {
    const {
      userId,
      messageId,
      leadId,
      leadName,
      userInformations,
      enabledChannels
    } = params

    if (!this.hasValidLeadName(leadName)) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because lead name is not valid yet. leadId=${leadId}`
      )
      return
    }

    if (!enabledChannels.includes(NotificationChannel.WHATSAPP)) {
      this.logger.log(
        `Skipping MESSAGE_RECEIVED WhatsApp notification because WHATSAPP channel is disabled for userId=${userId}`
      )
      return
    }

    const recipients = Array.from(
      new Set(
        (userInformations.notificationWhatsAppNumbers ?? [])
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

    const notificationMessage = `Lead ${leadName} mandou mensagem no Flow!`

    this.logger.log(
      `Dispatching MESSAGE_RECEIVED WhatsApp notification for leadId=${leadId} to ${recipients.length} recipient(s)`
    )

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.evolutionService.sendText(recipient, notificationMessage)
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

  private buildNewLeadEmail(params: {
    leadName: string
    firstContactAt: Date | undefined
  }): string {
    const { leadName, firstContactAt } = params
    const formattedDate = firstContactAt
      ? new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(firstContactAt)
      : 'agora'

    return `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">Novo lead criado</h2>
        <p><strong>Lead:</strong> ${leadName}</p>
        <p><strong>Primeiro contato:</strong> ${formattedDate}</p>
      </div>
    `
  }

  private getLeadId(data: unknown): string {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('leadId' in data) ||
      typeof data.leadId !== 'string' ||
      !data.leadId.trim()
    ) {
      throw new Error('lead.created requires a leadId')
    }

    return data.leadId
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

  private buildFollowUpReminderDescription(candidate: {
    followUpTitle: string
    actionChannel: FollowUpStepChannel | null
    actionType: FollowUpStepType | null
    leadName: string
  }): string {
    return `${candidate.followUpTitle} - ${this.getFollowUpActionLabel(candidate)} - ${candidate.leadName}`
  }

  private getFollowUpActionLabel(candidate: {
    actionChannel: FollowUpStepChannel | null
    actionType: FollowUpStepType | null
  }): string {
    if (candidate.actionChannel) {
      return this.getFollowUpChannelLabel(candidate.actionChannel)
    }

    return candidate.actionType === FollowUpStepType.SEND_EMAIL
      ? 'Email'
      : 'Sem canal'
  }

  private getFollowUpChannelLabel(channel: FollowUpStepChannel): string {
    if (channel === FollowUpStepChannel.INSTAGRAM) {
      return 'Direct'
    }

    if (channel === FollowUpStepChannel.WHATSAPP) {
      return 'WhatsApp'
    }

    if (channel === FollowUpStepChannel.MESSENGER) {
      return 'Messenger'
    }

    return 'Agenda'
  }

  private getOptionalFollowUpStepChannel(
    payload: Record<string, unknown>,
    key: string
  ): FollowUpStepChannel | null {
    const value = payload[key]

    if (value === null || value === undefined) {
      return null
    }

    if (
      typeof value !== 'string' ||
      !Object.values(FollowUpStepChannel).includes(value as FollowUpStepChannel)
    ) {
      throw new Error(`followup.reminder.1h has an invalid ${key}`)
    }

    return value as FollowUpStepChannel
  }

  private getOptionalFollowUpStepType(
    payload: Record<string, unknown>,
    key: string
  ): FollowUpStepType | null {
    const value = payload[key]

    if (value === null || value === undefined) {
      return null
    }

    if (
      typeof value !== 'string' ||
      !Object.values(FollowUpStepType).includes(value as FollowUpStepType)
    ) {
      throw new Error(`followup.reminder.1h has an invalid ${key}`)
    }

    return value as FollowUpStepType
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

import { randomUUID } from 'crypto'

import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { Repository } from 'typeorm'

import { AutomationTriggerDispatcher } from '../automation/flow/automation-trigger.dispatcher'
import {
  AutomationTriggerContext,
  AutomationTriggerType
} from '../automation/flow/automation-trigger.types'
import {
  Lead,
  LeadFlowState,
  LeadRuntimeMode,
  LeadState
} from '../leads/entities/lead.entity'
import {
  Message,
  MessageDirection,
  MessageStatus,
  MessageType
} from '../leads/entities/message.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { RabbitPublisherService } from '../rabbit/services/rabbit-publisher.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { classifyConversation } from './flow/conversation-classifier'
import { ConversationContextBuilder } from './flow/conversation-context.builder'
import { canRunAutomation } from './flow/conversation-policy'
import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import {
  LeadFlowActionContext,
  LeadFlowProcessResult
} from './flow/lead-flow.types'
import { canTransitionMessageStatus } from './message-status.policy'

type WhatsAppSendMessageResponse = {
  messaging_product: string
  contacts: {
    input: string
    wa_id: string
  }[]
  messages: {
    id: string
  }[]
}

type WhatsAppMessageStatusType = 'sent' | 'delivered' | 'read'

type WhatsAppMessageStatus = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}

export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        statuses?: WhatsAppMessageStatus[]
        messages?: Array<{
          type?: string
          from?: string
          timestamp?: string
          text?: {
            body?: string
          }
          id?: string
          referral?: {
            source_type?: string
            source_id?: string
            source_url?: string
            welcome_message?: {
              text?: string
            }
          }
        }>
        contacts?: Array<{
          profile?: {
            name?: string
          }
        }>
      }
    }>
  }>
}

type WhatsAppInboundMessage = {
  type?: string
  from?: string
  timestamp?: string
  text?: {
    body?: string
  }
  id?: string
  referral?: {
    source_type?: string
    source_id?: string
    source_url?: string
    welcome_message?: {
      text?: string
    }
  }
}

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    private readonly conversationContextBuilder: ConversationContextBuilder,
    private readonly leadFlowEngine: LeadFlowEngine,
    private readonly leadFlowActionExecutor: LeadFlowActionExecutor,
    private readonly automationTriggerDispatcher: AutomationTriggerDispatcher,
    private readonly rabbitPublisherService: RabbitPublisherService
  ) {}

  private readonly logger = new Logger(WebhookService.name)

  private readonly validFlowTransitions: Record<
    LeadFlowState,
    LeadFlowState[]
  > = {
    [LeadFlowState.NEW]: [LeadFlowState.ASKING_NAME],
    [LeadFlowState.ASKING_NAME]: [LeadFlowState.ASKING_CONTEXT],
    [LeadFlowState.ASKING_CONTEXT]: [LeadFlowState.IN_CONVERSATION],
    [LeadFlowState.IN_CONVERSATION]: []
  }

  async handleIncomingMessage(payload: WhatsAppWebhookPayload) {
    this.logger.debug(
      'Received WhatsApp webhook payload:',
      JSON.stringify(payload)
    )

    let inboundMessageId: string | undefined
    let from: string | undefined

    try {
      const entry = payload?.entry?.[0]
      if (!entry) {
        this.logger.warn(
          'Stopping webhook processing: missing entry in WhatsApp payload'
        )
        return { status: 'ignored_missing_entry' }
      }

      const change = entry.changes?.[0]
      if (!change) {
        this.logger.warn(
          'Stopping webhook processing: missing change in WhatsApp payload'
        )
        return { status: 'ignored_missing_change' }
      }

      const value = change.value
      if (!value) {
        this.logger.warn(
          'Stopping webhook processing: missing value in WhatsApp payload'
        )
        return { status: 'ignored_missing_value' }
      }

      const statuses = value.statuses
      if (statuses?.length) {
        return await this.handleMessageStatuses(statuses)
      }

      const messages = value.messages
      if (!messages?.length) {
        this.logger.warn(
          'Stopping webhook processing: webhook event has no inbound messages'
        )
        return { status: 'ignored_no_message' }
      }

      const message = messages[0]

      const displayPhoneNumber = value?.metadata?.display_phone_number
      const phoneNumberId = value?.metadata?.phone_number_id
      from = message?.from?.trim()
      inboundMessageId = message?.id?.trim()
      const text = message?.text?.body?.trim() ?? null
      const isFromAd = message?.referral?.source_type === 'ad'
      const leadSource = isFromAd ? 'MetaAds' : 'whatsapp'

      this.logger.log(
        `[1] Payload parsed. Inbound WhatsApp message received from ${from ?? 'unknown'} with id ${inboundMessageId ?? 'unknown'} and type ${message?.type ?? 'unknown'}`
      )

      if (!from || !inboundMessageId) {
        this.logger.warn(
          'Stopping webhook processing: inbound event is missing sender or message id'
        )
        return { status: 'ignored_missing_data' }
      }

      const existingInboundMessage = await this.messageRepo.findOne({
        where: { whatsappMessageId: inboundMessageId }
      })

      if (existingInboundMessage) {
        this.logger.warn(
          `Duplicate inbound message ignored. whatsappMessageId=${inboundMessageId} from=${from}`
        )
        return {
          status: 'ignored_duplicate_message',
          inboundMessageId
        }
      }

      this.logger.log(
        `New inbound message accepted. whatsappMessageId=${inboundMessageId} from=${from}`
      )

      if (message?.type !== 'text') {
        this.logger.warn(
          `Stopping webhook processing: inbound message ${inboundMessageId} has unsupported type ${message?.type ?? 'unknown'}`
        )
        return { status: 'ignored_non_text' }
      }

      if (!text) {
        this.logger.warn(
          `Stopping webhook processing: inbound text message ${inboundMessageId} has empty body`
        )
        return { status: 'ignored_missing_text' }
      }

      if (!displayPhoneNumber) {
        this.logger.warn(
          `Stopping webhook processing: inbound message ${inboundMessageId} is missing display_phone_number`
        )
        return { status: 'ignored_missing_business_phone' }
      }

      const userInformations = await this.userInformationsRepo.findOne({
        where: {
          phoneNumber: displayPhoneNumber
        }
      })

      if (!userInformations) {
        this.logger.warn(
          `Stopping webhook processing: no UserInformations found for business phone ${displayPhoneNumber}`
        )
        return { status: 'ignored_missing_user_informations' }
      }

      if (
        phoneNumberId?.trim() &&
        userInformations.phoneNumberId !== phoneNumberId
      ) {
        userInformations.phoneNumberId = phoneNumberId
        await this.userInformationsRepo.save(userInformations)
      }

      this.logger.log(
        `[2] Lead lookup started for user ${userInformations.userId} and phone ${from}`
      )

      let lead = await this.leadRepo.findOne({
        where: {
          userInformationsId: userInformations.id,
          phone: from,
          state: LeadState.ACTIVE
        }
      })

      this.logger.log(
        lead
          ? `[6] Lead found for inbound message ${inboundMessageId}: ${lead.id}`
          : `[6] No lead found for inbound message ${inboundMessageId} from ${from}`
      )

      // idempotência
      if (lead?.lastInboundMessageId === inboundMessageId) {
        this.logger.warn(
          `Stopping webhook processing: inbound message ${inboundMessageId} is a duplicate for lead ${lead.id}`
        )
        return { status: 'ignored_duplicate_message' }
      }

      // PRIMEIRO CONTATO (via anúncio)
      if (!lead) {
        const leadDraft = this.leadRepo.create({
          userInformationsId: userInformations.id,
          name: 'Lead sem nome',
          flowState: LeadFlowState.ASKING_NAME,
          phone: from,
          source: leadSource,
          state: LeadState.ACTIVE,
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          lastInboundMessageId: inboundMessageId ?? undefined,
          lastActivityAt: new Date()
        })

        this.logger.log(
          `[7] Persisting inbound message ${inboundMessageId} for new lead draft`
        )

        this.logger.log('[10] Saving lead for newly created inbound contact')
        lead = await this.leadRepo.save(leadDraft)

        await this.rabbitPublisherService.publish('lead.created', {
          leadId: lead.id,
          userId: userInformations.userId,
          origin: 'webhook',
          organizationId: null,
          userInformationsId: lead.userInformationsId,
          leadName: lead.name,
          description: lead.name,
          source: lead.source ?? null,
          createdAt: lead.createdAt
        })

        await this.notifyNewLeadToConfiguredWhatsAppNumbers({
          leadId: lead.id,
          phoneNumberId,
          notificationWhatsAppNumbers:
            userInformations.notificationWhatsAppNumbers,
          notificationPreferences: userInformations.notificationPreferences
        })

        const automationTriggerContext: AutomationTriggerContext = {
          triggerType: AutomationTriggerType.ON_MESSAGE_RECEIVED,
          leadId: lead.id,
          inboundMessageId: inboundMessageId ?? undefined,
          correlationId: randomUUID(),
          metadata: {
            source: 'webhook',
            from,
            messageText: text,
            phoneNumberId
          }
        }

        await this.automationTriggerDispatcher.dispatch(
          automationTriggerContext
        )

        lead = await this.leadRepo.findOneOrFail({
          where: {
            id: lead.id
          }
        })

        await this.persistMessage({
          leadId: lead.id,
          leadName: lead.name,
          userId: userInformations.userId,
          message
        })

        const reply = 'Olá! 👋 \nComo podemos te chamar?'

        const response = await this.sendWhatsAppMessage(
          from,
          reply,
          phoneNumberId
        )

        lead.lastAutoReplyMessageId =
          response?.data?.messages?.[0]?.id ?? undefined

        this.logger.log('[10] Saving lead after first auto-reply dispatch')
        await this.leadRepo.save(lead)

        return { status: 'created_and_replied', leadId: lead.id }
      }

      this.logger.log(
        `[7] Persisting inbound message ${inboundMessageId} for lead ${lead.id}`
      )

      const automationTriggerContext: AutomationTriggerContext = {
        triggerType: AutomationTriggerType.ON_MESSAGE_RECEIVED,
        leadId: lead.id,
        inboundMessageId: inboundMessageId ?? undefined,
        correlationId: randomUUID(),
        metadata: {
          source: 'webhook',
          from,
          messageText: text,
          phoneNumberId
        }
      }

      await this.automationTriggerDispatcher.dispatch(automationTriggerContext)

      lead = await this.leadRepo.findOneOrFail({
        where: {
          id: lead.id
        }
      })

      await this.persistMessage({
        leadId: lead.id,
        leadName: lead.name,
        userId: userInformations.userId,
        message
      })

      // CONTINUAÇÃO DA CONVERSA (já virou lead)

      this.logger.log(
        `[8] Runtime mode decision for lead ${lead.id}: ${lead.runtimeMode}`
      )

      const conversationContext = await this.conversationContextBuilder.build({
        lead
      })

      const conversationType = classifyConversation(conversationContext)
      this.logger.debug(
        `Conversation type classified: leadId=${lead.id} conversationType=${conversationType}`
      )

      const shouldRunAutomation = canRunAutomation({
        lead,
        conversationType
      })

      if (!shouldRunAutomation) {
        this.logger.warn(
          `Stopping webhook processing: lead ${lead.id} is in HUMAN runtime mode, automation will be skipped`
        )

        lead.lastInboundMessageId = inboundMessageId ?? undefined
        lead.lastActivityAt = new Date()

        this.logger.log(
          '[10] Saving lead after HUMAN runtime mode inbound update'
        )
        await this.leadRepo.save(lead)

        return { status: 'updated_human_mode_skipped', leadId: lead.id }
      }

      this.logger.log(
        `[9] Executing FlowEngine for lead ${lead.id} with inbound message ${inboundMessageId}`
      )

      const flowResult: LeadFlowProcessResult = this.leadFlowEngine.process({
        lead,
        messageText: text,
        conversationContext
      })

      const actionContext: LeadFlowActionContext = {
        trigger: 'webhook',
        phoneNumberId,
        inboundMessageId: inboundMessageId ?? undefined,
        correlationId: randomUUID()
      }

      const leadNameBeforeFlowExecution = lead.name

      await this.leadFlowActionExecutor.execute({
        context: actionContext,
        lead,
        actions: flowResult.actions,
        transitionLeadFlowState: ({ lead: transitionLead, to }) =>
          this.transitionLeadFlowState({
            lead: transitionLead,
            to
          }),
        sendWhatsAppMessage: async ({ context, to, content }) => {
          const response = await this.sendWhatsAppMessage(
            to,
            content,
            context.phoneNumberId
          )
          const whatsappMessageId = response?.data?.messages?.[0]?.id ?? null

          lead.lastAutoReplyMessageId = whatsappMessageId ?? undefined

          return {
            whatsappMessageId
          }
        },
        persistOutboundMessage: async ({
          context,
          leadId,
          content,
          whatsappMessageId
        }) =>
          this.persistOutboundMessage({
            correlationId: context.correlationId,
            leadId,
            content,
            whatsappMessageId
          })
      })

      if (
        !this.hasValidLeadName(leadNameBeforeFlowExecution) &&
        this.hasValidLeadName(lead.name)
      ) {
        await this.rabbitPublisherService.publish('lead.created', {
          leadId: lead.id,
          userId: userInformations.userId,
          origin: 'webhook',
          organizationId: null,
          userInformationsId: lead.userInformationsId,
          leadName: lead.name,
          description: lead.name,
          source: lead.source ?? null,
          createdAt: lead.createdAt
        })
      }

      lead.lastInboundMessageId = inboundMessageId ?? undefined

      this.logger.log('[10] Saving lead after FlowEngine execution')
      await this.leadRepo.save(lead)

      return { status: 'updated_and_replied', leadId: lead.id }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined

      this.logger.error(
        `Webhook inbound processing failed. inboundMessageId=${inboundMessageId ?? 'unknown'} phone=${from ?? 'unknown'} error=${errorMessage}`,
        errorStack
      )

      return {
        status: 'error',
        inboundMessageId,
        from
      }
    }
  }

  private async handleMessageStatuses(statuses: WhatsAppMessageStatus[]) {
    let processedCount = 0

    for (const messageStatus of statuses) {
      const status = messageStatus?.status?.trim()

      if (!this.isSupportedWhatsAppStatus(status)) {
        this.logger.debug(
          `Ignoring unsupported WhatsApp status event. status=${status ?? 'unknown'} whatsappMessageId=${messageStatus?.id ?? 'unknown'}`
        )
        continue
      }

      const whatsappMessageId = messageStatus?.id?.trim()
      if (!whatsappMessageId) {
        this.logger.warn(
          `WhatsApp status update ignored due to missing message id. status=${status}`
        )
        continue
      }

      const message = await this.messageRepo.findOne({
        where: { whatsappMessageId }
      })

      if (!message) {
        this.logger.warn(
          `Message not found for WhatsApp status update. whatsappMessageId=${whatsappMessageId} status=${status}`
        )
        continue
      }

      this.logger.log(
        `Message found for status update. messageId=${message.id} whatsappMessageId=${whatsappMessageId}`
      )

      const previousStatus = message.status ?? null
      const newStatus = this.resolveWhatsAppMessageStatus(status)

      if (!canTransitionMessageStatus(previousStatus, newStatus)) {
        this.logger.warn(
          `Skipping WhatsApp status regression. messageId=${message.id} whatsappMessageId=${whatsappMessageId} previousStatus=${previousStatus ?? 'null'} nextStatus=${newStatus}`
        )
        continue
      }

      message.status = newStatus
      await this.messageRepo.save(message)

      processedCount += 1
      this.logger.log(
        `Message status updated. messageId=${message.id} whatsappMessageId=${whatsappMessageId} previousStatus=${previousStatus ?? 'null'} newStatus=${newStatus} status=${status} timestamp=${messageStatus?.timestamp ?? 'unknown'} recipientId=${messageStatus?.recipient_id ?? 'unknown'}`
      )
    }

    return {
      status: 'processed_status_updates',
      processedCount
    }
  }

  private async persistMessage(params: {
    leadId: string
    leadName?: string
    userId: string
    message: WhatsAppInboundMessage
  }): Promise<void> {
    const { leadId, leadName, userId, message } = params

    try {
      const whatsappMessageId = message?.id

      if (whatsappMessageId) {
        const alreadyExists = await this.messageRepo.findOne({
          where: { whatsappMessageId }
        })

        if (alreadyExists) {
          this.logger.debug(
            `Inbound WhatsApp message ${whatsappMessageId} already persisted for lead ${leadId}`
          )
          return
        }
      }

      const inboundMessage = this.messageRepo.create({
        leadId,
        direction: MessageDirection.INBOUND,
        content: message?.text?.body ?? null,
        type: this.resolveMessageType(message?.type),
        whatsappMessageId: whatsappMessageId ?? null,
        metadata: message as Record<string, unknown>,
        externalTimestamp: this.parseWhatsAppTimestamp(message?.timestamp)
      })

      await this.messageRepo.save(inboundMessage)

      await this.rabbitPublisherService.publish('message.received', {
        messageId: inboundMessage.id,
        leadId,
        leadName: leadName ?? null,
        userId,
        organizationId: null,
        createdAt: inboundMessage.createdAt
      })

      this.logger.log(
        `Inbound WhatsApp message persisted for lead ${leadId} with id ${whatsappMessageId ?? 'unknown'}`
      )
    } catch (error) {
      this.logger.warn(
        `Failed to persist inbound WhatsApp message: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  private async persistOutboundMessage(params: {
    correlationId?: string
    leadId: string
    content: string
    whatsappMessageId?: string | null
  }) {
    const { correlationId, leadId, content, whatsappMessageId } = params

    try {
      if (correlationId) {
        this.logger.debug(
          `[${correlationId}] Persisting outbound message for lead ${leadId}`
        )
      }

      await this.messageRepo.save(
        this.messageRepo.create({
          leadId,
          direction: MessageDirection.OUTBOUND,
          content,
          type: MessageType.TEXT,
          whatsappMessageId: whatsappMessageId ?? null
        })
      )
    } catch (error) {
      this.logger.warn(
        `Failed to persist outbound WhatsApp message: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  private async transitionLeadFlowState(params: {
    lead: Lead
    to: LeadFlowState
  }) {
    const { lead, to } = params

    const currentState = lead.flowState
    const allowedTransitions = this.validFlowTransitions[currentState] ?? []

    if (!allowedTransitions.includes(to)) {
      throw new BadRequestException(
        `Invalid lead flow transition from ${currentState} to ${to}`
      )
    }

    lead.flowState = to
    lead.lastActivityAt = new Date()

    await this.handleFlowStateEntered({
      lead,
      state: to
    })
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleFlowStateEntered(params: {
    lead: Lead
    state: LeadFlowState
  }) {
    const { lead, state } = params

    switch (state) {
      case LeadFlowState.IN_CONVERSATION:
        this.logger.log(`Lead ${lead.id} transitioned to ${state}`)
        break
      default:
        break
    }
  }

  private async sendWhatsAppMessage(
    to: string,
    reply: string,
    phoneNumberId?: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    return axios.post(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
  }

  private async notifyNewLeadToConfiguredWhatsAppNumbers(params: {
    leadId: string
    phoneNumberId?: string
    notificationWhatsAppNumbers?: string[]
    notificationPreferences?: UserInformations['notificationPreferences']
  }) {
    const {
      leadId,
      phoneNumberId,
      notificationWhatsAppNumbers,
      notificationPreferences
    } = params

    const enabledChannels =
      notificationPreferences?.[NotificationType.NEW_LEAD] ?? []

    if (!enabledChannels.includes(NotificationChannel.WHATSAPP)) {
      this.logger.log(
        `Skipping WhatsApp new lead notification because WHATSAPP channel is disabled for lead ${leadId}`
      )
      return
    }

    const recipients = Array.from(
      new Set(
        (notificationWhatsAppNumbers ?? [])
          .map((number) => number.trim())
          .filter((number) => number.length > 0)
      )
    )

    if (!recipients.length) {
      return
    }

    if (!phoneNumberId?.trim()) {
      this.logger.warn(
        `Skipping new lead notification dispatch for lead ${leadId}: missing phone_number_id`
      )
      return
    }

    const notificationMessage = 'Tem novo Lead no Flow!'
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.sendWhatsAppMessage(recipient, notificationMessage, phoneNumberId)
      )
    )

    const successCount = results.filter(
      (result) => result.status === 'fulfilled'
    ).length

    if (successCount > 0) {
      this.logger.log(
        `New lead notification sent for lead ${leadId}. success=${successCount}/${recipients.length}`
      )
    }

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Failed to send new lead notification for lead ${leadId} to ${recipients[index]}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
        )
      }
    })
  }

  private resolveMessageType(type?: string): MessageType {
    switch (type) {
      case MessageType.IMAGE:
        return MessageType.IMAGE
      case MessageType.AUDIO:
        return MessageType.AUDIO
      case MessageType.VIDEO:
        return MessageType.VIDEO
      case MessageType.DOCUMENT:
        return MessageType.DOCUMENT
      case MessageType.TEXT:
      default:
        return MessageType.TEXT
    }
  }

  private isSupportedWhatsAppStatus(
    status?: string
  ): status is WhatsAppMessageStatusType {
    return status === 'sent' || status === 'delivered' || status === 'read'
  }

  private resolveWhatsAppMessageStatus(
    status: WhatsAppMessageStatusType
  ): MessageStatus {
    switch (status) {
      case 'sent':
        return MessageStatus.SENT
      case 'delivered':
        return MessageStatus.DELIVERED
      case 'read':
        return MessageStatus.READ
    }
  }

  private parseWhatsAppTimestamp(timestamp?: string): Date | null {
    if (!timestamp) return null

    const numericTimestamp = Number(timestamp)
    if (Number.isNaN(numericTimestamp)) return null

    return new Date(numericTimestamp * 1000)
  }

  private hasValidLeadName(leadName?: string | null): boolean {
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

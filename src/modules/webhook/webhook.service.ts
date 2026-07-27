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
import { LeadsService } from '../leads/leads.service'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { RabbitPublisherService } from '../rabbit/services/rabbit-publisher.service'
import { RealtimeService } from '../realtime/realtime.service'
import { StorageService } from '../storage/storage.service'
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

type WhatsAppMediaResponse = {
  url: string
  mime_type?: string
  sha256?: string
  file_size?: number
  id: string
  messaging_product?: string
}

type WhatsAppMessageStatusType = 'sent' | 'delivered' | 'read'

type WhatsAppMessageStatus = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}

type WhatsAppAudioMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  voice?: boolean
}

type WhatsAppImageMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

type WhatsAppVideoMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

type WhatsAppDocumentMessage = {
  id?: string
  filename?: string
  mime_type?: string
  sha256?: string
  caption?: string
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
          audio?: WhatsAppAudioMessage
          image?: WhatsAppImageMessage
          video?: WhatsAppVideoMessage
          document?: WhatsAppDocumentMessage
          button?: {
            text?: string
            payload?: string
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
  audio?: WhatsAppAudioMessage
  image?: WhatsAppImageMessage
  video?: WhatsAppVideoMessage
  document?: WhatsAppDocumentMessage
  button?: {
    text?: string
    payload?: string
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
    private readonly rabbitPublisherService: RabbitPublisherService,
    private readonly storageService: StorageService,
    private readonly leadsService: LeadsService,
    private readonly realtimeService: RealtimeService
  ) {}

  private readonly logger = new Logger(WebhookService.name)

  private readonly validFlowTransitions: Record<
    LeadFlowState,
    LeadFlowState[]
  > = {
    [LeadFlowState.NEW]: [LeadFlowState.ASKING_NAME],
    [LeadFlowState.ASKING_NAME]: [LeadFlowState.ASKING_LOCATION],
    [LeadFlowState.ASKING_LOCATION]: [LeadFlowState.ASKING_CONTEXT],
    [LeadFlowState.ASKING_CONTEXT]: [LeadFlowState.IN_CONVERSATION],
    [LeadFlowState.IN_CONVERSATION]: []
  }

  async handleIncomingMessage(payload: WhatsAppWebhookPayload) {
    this.logger.log(
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
      const text = this.resolveInboundMessageContent(message)
      const resolvedMessageType = this.resolveMessageType(message?.type)
      const isTextMessage = resolvedMessageType === MessageType.TEXT
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

      if (isTextMessage && !text) {
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

        if (!isTextMessage) {
          return this.processInboundMediaMessage({
            lead,
            userId: userInformations.userId,
            message,
            inboundMessageId
          })
        }

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

        const persistedMessageResult = await this.persistMessage({
          leadId: lead.id,
          leadName: lead.name,
          userId: userInformations.userId,
          message
        })

        if (persistedMessageResult.wasCreated) {
          await this.emitMessageCreated(persistedMessageResult.message)
        }

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

      if (!isTextMessage) {
        return this.processInboundMediaMessage({
          lead,
          userId: userInformations.userId,
          message,
          inboundMessageId
        })
      }

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

      const persistedMessageResult = await this.persistMessage({
        leadId: lead.id,
        leadName: lead.name,
        userId: userInformations.userId,
        message
      })

      if (persistedMessageResult.wasCreated) {
        await this.emitMessageCreated(persistedMessageResult.message)
      }

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
        messageText: text ?? '',
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
  }): Promise<{ message: Message; wasCreated: boolean }> {
    const { leadId, leadName, userId, message } = params

    const resolvedMessageType = this.resolveMessageType(message?.type)
    let content: string | null = this.resolveInboundMessageContent(message)
    let metaMediaId: string | null = null
    let mimeType: string | null = null
    let mediaSha256: string | null = null
    let fileName: string | null = null
    let metadata: Record<string, unknown> | null = message as Record<
      string,
      unknown
    >

    switch (resolvedMessageType) {
      case MessageType.AUDIO:
        content = null
        metaMediaId = message?.audio?.id ?? null
        mimeType = message?.audio?.mime_type ?? null
        mediaSha256 = message?.audio?.sha256 ?? null
        metadata =
          (message?.audio as Record<string, unknown> | undefined) ?? null
        break
      case MessageType.IMAGE:
        content = message?.image?.caption ?? null
        metaMediaId = message?.image?.id ?? null
        mimeType = message?.image?.mime_type ?? null
        mediaSha256 = message?.image?.sha256 ?? null
        metadata =
          (message?.image as Record<string, unknown> | undefined) ?? null
        break
      case MessageType.VIDEO:
        content = message?.video?.caption ?? null
        metaMediaId = message?.video?.id ?? null
        mimeType = message?.video?.mime_type ?? null
        mediaSha256 = message?.video?.sha256 ?? null
        metadata =
          (message?.video as Record<string, unknown> | undefined) ?? null
        break
      case MessageType.DOCUMENT:
        content = message?.document?.caption ?? null
        metaMediaId = message?.document?.id ?? null
        mimeType = message?.document?.mime_type ?? null
        mediaSha256 = message?.document?.sha256 ?? null
        fileName = message?.document?.filename ?? null
        metadata =
          (message?.document as Record<string, unknown> | undefined) ?? null
        break
      case MessageType.TEXT:
      default:
        break
    }

    const inboundMessage = this.messageRepo.create({
      leadId,
      direction: MessageDirection.INBOUND,
      content,
      type: resolvedMessageType,
      whatsappMessageId: message?.id ?? null,
      metaMediaId,
      mimeType,
      mediaSha256,
      fileName,
      metadata,
      externalTimestamp: this.parseWhatsAppTimestamp(message?.timestamp)
    })

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
          return {
            message: alreadyExists,
            wasCreated: false
          }
        }
      }

      const savedMessage = await this.messageRepo.save(inboundMessage)

      await this.rabbitPublisherService.publish('message.received', {
        messageId: savedMessage.id,
        leadId,
        leadName: leadName ?? null,
        userId,
        organizationId: null,
        createdAt: savedMessage.createdAt
      })

      this.logger.log(
        `Inbound WhatsApp message persisted for lead ${leadId} with id ${whatsappMessageId ?? 'unknown'}`
      )

      return {
        message: savedMessage,
        wasCreated: true
      }
    } catch (error) {
      this.logger.warn(
        `Failed to persist inbound WhatsApp message: ${error instanceof Error ? error.message : 'unknown error'}`
      )

      return {
        message: inboundMessage,
        wasCreated: false
      }
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

  private async processInboundMediaMessage(params: {
    lead: Lead
    userId: string
    message: WhatsAppInboundMessage
    inboundMessageId: string
  }): Promise<{ status: string; leadId: string }> {
    const { lead, userId, message, inboundMessageId } = params

    const persistedMessageResult = await this.persistMessage({
      leadId: lead.id,
      leadName: lead.name,
      userId,
      message
    })

    const persistedMessage = persistedMessageResult.message

    await this.uploadInboundMedia({
      message: persistedMessage
    })

    if (persistedMessageResult.wasCreated) {
      await this.emitMessageCreated(persistedMessage)
    }

    lead.lastInboundMessageId = inboundMessageId
    lead.lastActivityAt = new Date()

    this.logger.log('[10] Saving lead after media message processing')
    await this.leadRepo.save(lead)

    return { status: 'media_message_processed', leadId: lead.id }
  }

  private async emitMessageCreated(message: Message): Promise<void> {
    try {
      const responseMessage =
        await this.leadsService.toResponseMessageDto(message)

      this.realtimeService.emitToLead(
        message.leadId,
        'message.created',
        responseMessage
      )

      this.logger.log(
        `Realtime event emitted. event=message.created leadId=${message.leadId} messageId=${message.id}`
      )
    } catch (error) {
      this.logger.warn(
        `Failed to emit realtime event message.created. leadId=${message.leadId} messageId=${message.id} error=${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  private async uploadInboundMedia(params: {
    message: Message
  }): Promise<void> {
    const { message } = params

    if (!message.id) {
      this.logger.warn(
        `Inbound media message has no persisted id. leadId=${message.leadId} whatsappMessageId=${message.whatsappMessageId ?? 'unknown'}`
      )
      return
    }

    if (!message.metaMediaId?.trim()) {
      this.logger.warn(
        `Inbound media message has no meta media id. leadId=${message.leadId} messageId=${message.id} whatsappMessageId=${message.whatsappMessageId ?? 'unknown'}`
      )
      return
    }

    try {
      const mediaInfo = await this.getWhatsAppMediaInfo(message.metaMediaId)
      const buffer = await this.downloadWhatsAppMedia(mediaInfo.data.url)
      const mimeType =
        mediaInfo.data.mime_type?.trim() ||
        message.mimeType?.trim() ||
        'application/octet-stream'
      const extension = this.resolveMediaFileExtension(mimeType)
      const key = `leads/${message.leadId}/messages/${message.id}.${extension}`
      const uploadResponse = await this.storageService.uploadFile(
        {
          originalname:
            message.fileName?.trim() || `${message.id}.${extension}`,
          mimetype: mimeType,
          size: buffer.length,
          buffer
        },
        { key }
      )

      message.mediaUrl = uploadResponse.url
      message.mediaSize = mediaInfo.data.file_size ?? buffer.length
      message.mimeType = mimeType

      await this.messageRepo.save(message)
    } catch (error) {
      this.logger.warn(
        `Failed to upload inbound media message. leadId=${message.leadId} messageId=${message.id} whatsappMessageId=${message.whatsappMessageId ?? 'unknown'} error=${error instanceof Error ? error.message : 'unknown error'}`
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

  private async getWhatsAppMediaInfo(
    mediaId: string
  ): Promise<{ data: WhatsAppMediaResponse }> {
    return axios.get(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
  }

  private async downloadWhatsAppMedia(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    })

    return Buffer.from(response.data)
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

  private resolveInboundMessageContent(
    message: WhatsAppInboundMessage
  ): string | null {
    // Tenta extrair conteúdo textual baseado no tipo de mensagem
    
    // Para mensagens de texto normais
    if (message?.text?.body?.trim()) {
      return message.text.body.trim()
    }
    
    // Para mensagens de botão (template da Meta)
    if (message?.button?.text?.trim()) {
      return message.button.text.trim()
    }
    
    if (message?.button?.payload?.trim()) {
      return message.button.payload.trim()
    }
    
    return null
  }

  private resolveMessageType(type?: string): MessageType {
    switch (type) {
      case 'button':
        // Mensagens de botão são tratadas como TEXT
        return MessageType.TEXT
      case MessageType.IMAGE:
        return MessageType.IMAGE
      case MessageType.AUDIO:
        return MessageType.AUDIO
      case MessageType.VIDEO:
        return MessageType.VIDEO
      case MessageType.DOCUMENT:
        return MessageType.DOCUMENT
      case MessageType.BUTTON:
        return MessageType.BUTTON
      case MessageType.TEXT:
      default:
        return MessageType.TEXT
    }
  }

  private resolveMediaFileExtension(mimeType?: string): string {
    const normalizedMimeType = mimeType?.trim().toLowerCase()

    if (!normalizedMimeType) {
      return 'bin'
    }

    const [rawType] = normalizedMimeType.split(';', 1)

    switch (rawType) {
      case 'audio/ogg':
        return 'ogg'
      case 'audio/mpeg':
        return 'mp3'
      case 'audio/mp4':
        return 'mp4'
      case 'audio/aac':
        return 'aac'
      case 'audio/amr':
        return 'amr'
      case 'image/jpeg':
        return 'jpg'
      case 'image/png':
        return 'png'
      case 'image/webp':
        return 'webp'
      case 'image/gif':
        return 'gif'
      case 'video/mp4':
        return 'mp4'
      case 'application/pdf':
        return 'pdf'
      case 'text/plain':
        return 'txt'
      case 'text/csv':
        return 'csv'
      case 'application/msword':
        return 'doc'
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return 'docx'
      case 'application/vnd.ms-excel':
        return 'xls'
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return 'xlsx'
      case 'application/vnd.ms-powerpoint':
        return 'ppt'
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return 'pptx'
      default: {
        const slashIndex = rawType.indexOf('/')

        if (slashIndex === -1 || slashIndex === rawType.length - 1) {
          return 'bin'
        }

        return rawType.slice(slashIndex + 1)
      }
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

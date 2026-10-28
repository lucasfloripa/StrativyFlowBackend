import { randomUUID } from 'crypto'

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Company } from '../company/company.entity'
import { LeadChannel } from '../leads/entities/lead-channel-identity.entity'
import {
  Lead,
  LeadFlowState,
  LeadRuntimeMode,
  LeadState
} from '../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  MessageType
} from '../leads/entities/message.entity'
import { LeadsService } from '../leads/leads.service'
import { LeadChannelIdentityService } from '../leads/services/lead-channel-identity.service'
import { buildBrazilianPhoneVariants } from '../leads/utils/brazilian-phone'
import { OutboxService } from '../outbox/services/outbox.service'
import {
  REALTIME_EMITTER,
  type RealtimeEmitter
} from '../realtime/realtime-emitter'
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
import { FollowUpReplyLinkerService } from './follow-up-reply-linker.service'
import { DeferredInboundEventError } from './inbound/deferred-inbound-event.error'
import {
  InboundEventInboxService,
  type InboxOutcome
} from './inbound/inbound-event-inbox.service'
import { InboundEventStatus } from './inbound/inbound-event.entity'
import {
  type InboundEvent,
  InboundSkipReason,
  type InstagramInboundEvent,
  type MessengerInboundEvent,
  type SkippedInboundItem,
  type WhatsAppMessageInboundEvent,
  type WhatsAppStatusInboundEvent
} from './inbound/inbound-event.types'
import { normalizeInstagramWebhook } from './inbound/instagram-inbound.normalizer'
import { normalizeMessengerWebhook } from './inbound/messenger-inbound.normalizer'
import {
  isWhatsAppMessageEvent,
  isWhatsAppStatusEvent,
  normalizeWhatsAppWebhook
} from './inbound/whatsapp-inbound.normalizer'
import { InstagramMessagingService } from './instagram-messaging.service'
import { LeadWriter } from './lead-writer'
import { InboundMediaService } from './media/inbound-media.service'
import { canTransitionMessageStatus } from './message-status.policy'
import { MessengerMessagingService } from './messenger-messaging.service'
import { AutomaticReplyService } from './outbound/automatic-reply.service'

import type {
  InstagramDirectWebhookPayload,
  MessengerWebhookPayload,
  WhatsAppInboundMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhookPayload
} from './inbound/meta-webhook-payload.types'

type WhatsAppMessageStatusType = 'sent' | 'delivered' | 'read'

type WhatsAppWebhookResult = Record<string, unknown>

type SocialEventResult =
  | { outcome: 'processed'; detail: string; leadId?: string }
  | { outcome: 'ignored'; reason: string }

const processedSocialEvent = (
  detail: string,
  leadId?: string
): SocialEventResult => ({ outcome: 'processed', detail, leadId })

const ignoredSocialEvent = (reason: string): SocialEventResult => ({
  outcome: 'ignored',
  reason
})

const toSocialInboxOutcome = (result: SocialEventResult): InboxOutcome =>
  result.outcome === 'ignored'
    ? { status: InboundEventStatus.IGNORED, reason: result.reason }
    : { status: InboundEventStatus.PROCESSED, note: result.detail }

const toStatusInboxOutcome = (result: {
  processedCount: number
}): InboxOutcome =>
  result.processedCount > 0
    ? { status: InboundEventStatus.PROCESSED }
    : { status: InboundEventStatus.IGNORED, reason: 'status_not_applied' }

/** Every early exit of the WhatsApp flow reports a status starting with `ignored_`. */
const toWhatsAppInboxOutcome = (
  result: WhatsAppWebhookResult
): InboxOutcome => {
  const status = typeof result.status === 'string' ? result.status : 'unknown'

  return status.startsWith('ignored_')
    ? { status: InboundEventStatus.IGNORED, reason: status }
    : { status: InboundEventStatus.PROCESSED, note: status }
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
    private readonly outboxService: OutboxService,
    private readonly leadsService: LeadsService,
    private readonly leadChannelIdentityService: LeadChannelIdentityService,
    private readonly messengerMessagingService: MessengerMessagingService,
    private readonly instagramMessagingService: InstagramMessagingService,
    @Inject(REALTIME_EMITTER)
    private readonly realtimeService: RealtimeEmitter,
    private readonly followUpReplyLinkerService: FollowUpReplyLinkerService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly inboundEventInbox: InboundEventInboxService,
    private readonly automaticReplyService: AutomaticReplyService,
    private readonly inboundMediaService: InboundMediaService
  ) {
    this.leadWriter = new LeadWriter(leadRepo)
  }

  private readonly leadWriter: LeadWriter

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

  async handleIncomingMessage(
    payload: WhatsAppWebhookPayload
  ): Promise<WhatsAppWebhookResult> {
    this.logger.log(
      `Received WhatsApp webhook. entries=${payload?.entry?.length ?? 0}`
    )

    if (!payload?.entry?.length) {
      this.logger.warn(
        'Stopping webhook processing: missing entry in WhatsApp payload'
      )
      return { status: 'ignored_missing_entry' }
    }

    const { events, skipped } = normalizeWhatsAppWebhook(payload)
    this.logSkippedInboundItems(skipped)

    const statusEvents = events.filter(isWhatsAppStatusEvent)
    const messageEvents = events.filter(isWhatsAppMessageEvent)

    if (!statusEvents.length && !messageEvents.length) {
      this.logger.warn(
        'Stopping webhook processing: webhook event has no inbound messages or statuses'
      )
      return { status: 'ignored_no_message' }
    }

    const results: WhatsAppWebhookResult[] = []

    if (statusEvents.length) {
      results.push(await this.runWhatsAppStatusEvents(statusEvents))
    }

    // Meta may batch several messages in one POST: every one is processed.
    for (const messageEvent of messageEvents) {
      results.push(await this.runWhatsAppMessageEvent(messageEvent))
    }

    if (results.length === 1) {
      return results[0]
    }

    this.logger.log(
      `WhatsApp webhook batch processed. statuses=${statusEvents.length} messages=${messageEvents.length}`
    )

    return { status: 'processed_batch', results }
  }

  /**
   * Worker entry point (`WEBHOOK_ASYNC_PROCESSING`): processes one stored
   * event and reports how it ended. Errors propagate, so the event is retried.
   */
  async processInboundEvent(event: InboundEvent): Promise<InboxOutcome> {
    switch (event.channel) {
      case LeadChannel.WHATSAPP:
        return isWhatsAppStatusEvent(event)
          ? toStatusInboxOutcome(
              await this.handleMessageStatuses([event.payload.status], {
                deferWhenMissing: true
              })
            )
          : toWhatsAppInboxOutcome(
              await this.processWhatsAppMessageEvent(event)
            )
      case LeadChannel.MESSENGER:
        return toSocialInboxOutcome(await this.processMessengerEvent(event))
      case LeadChannel.INSTAGRAM:
        return toSocialInboxOutcome(await this.processInstagramEvent(event))
    }
  }

  private logSkippedInboundItems(skipped: SkippedInboundItem[]): void {
    const groups = new Map<string, SkippedInboundItem & { count: number }>()

    for (const item of skipped) {
      const key = `${item.channel}|${item.reason}`
      const group = groups.get(key) ?? { ...item, count: 0 }
      group.count += 1
      groups.set(key, group)
    }

    for (const { channel, reason, count } of groups.values()) {
      const message = `Skipped inbound webhook items. channel=${channel} reason=${reason} count=${count}`

      if (reason === InboundSkipReason.ECHO) {
        this.logger.debug(message)
      } else {
        this.logger.warn(message)
      }
    }
  }

  private async runWhatsAppStatusEvents(
    statusEvents: WhatsAppStatusInboundEvent[]
  ): Promise<WhatsAppWebhookResult> {
    let processedCount = 0

    for (const statusEvent of statusEvents) {
      try {
        const run = await this.inboundEventInbox.run(
          statusEvent,
          () => this.handleMessageStatuses([statusEvent.payload.status]),
          toStatusInboxOutcome
        )

        if (run.claimed) {
          processedCount += run.result.processedCount
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'unknown error'

        this.logger.error(
          `WhatsApp status update failed. dedupeKey=${statusEvent.dedupeKey} error=${errorMessage}`,
          error instanceof Error ? error.stack : undefined
        )
      }
    }

    return {
      status: 'processed_status_updates',
      processedCount
    }
  }

  /**
   * Runs one WhatsApp message through the inbox. A failure is recorded as
   * `failed` in `inbound_events` and answered with 200, as before, so Meta
   * does not redeliver the whole batch.
   */
  private async runWhatsAppMessageEvent(
    event: WhatsAppMessageInboundEvent
  ): Promise<WhatsAppWebhookResult> {
    try {
      const run = await this.inboundEventInbox.run(
        event,
        () => this.processWhatsAppMessageEvent(event),
        toWhatsAppInboxOutcome
      )

      if (!run.claimed) {
        return {
          status: 'ignored_duplicate_message',
          inboundMessageId: event.dedupeKey
        }
      }

      return run.result
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined

      this.logger.error(
        `Webhook inbound processing failed. inboundMessageId=${event.dedupeKey} phone=${event.externalUserId ?? 'unknown'} error=${errorMessage}`,
        errorStack
      )

      return {
        status: 'error',
        inboundMessageId: event.dedupeKey,
        from: event.externalUserId ?? undefined
      }
    }
  }

  private async processWhatsAppMessageEvent(
    event: WhatsAppMessageInboundEvent
  ): Promise<WhatsAppWebhookResult> {
    const { message, metadata, contacts } = event.payload
    const value = { metadata, contacts }

    const displayPhoneNumber = value?.metadata?.display_phone_number
    const phoneNumberId = value?.metadata?.phone_number_id
    const profileName = this.resolveInboundContactProfileName(value?.contacts)
    const from = message?.from?.trim()
    const inboundMessageId = message?.id?.trim()
    const text = this.resolveInboundMessageContent(message)
    const resolvedMessageType = this.resolveMessageType(message?.type)
    const isTextMessage = resolvedMessageType === MessageType.TEXT
    const isFromAd = message?.referral?.source_type === 'ad'
    const isFromGoogleAds = text?.toLowerCase().includes('google ads')
    const leadSource = isFromAd
      ? 'Meta Ads'
      : isFromGoogleAds
        ? 'GoogleAds'
        : 'whatsapp'
    const metaAdId = isFromAd ? message?.referral?.source_id : undefined
    const googleAdId = isFromGoogleAds ? 'google_ads_contact' : undefined

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
      where: {
        channel: MessageChannel.WHATSAPP,
        externalMessageId: inboundMessageId
      }
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

    const eventPhoneNumberId = phoneNumberId?.trim()
    const businessPhoneNumber = displayPhoneNumber?.trim()

    if (!businessPhoneNumber && !eventPhoneNumberId) {
      this.logger.warn(
        `Stopping webhook processing: inbound message ${inboundMessageId} is missing display_phone_number`
      )
      return { status: 'ignored_missing_business_phone' }
    }

    let company = eventPhoneNumberId
      ? await this.companyRepo.findOne({
          where: { companyPhoneNumberId: eventPhoneNumberId }
        })
      : null

    if (!company && businessPhoneNumber) {
      company = await this.companyRepo.findOne({
        where: { companyPhoneNumber: businessPhoneNumber }
      })
    }

    if (!company) {
      this.logger.warn(
        'Stopping WhatsApp webhook processing: no Company matches the receiving account'
      )
      return { status: 'ignored_missing_company' }
    }

    if (
      eventPhoneNumberId &&
      company.companyPhoneNumberId?.trim() &&
      company.companyPhoneNumberId.trim() !== eventPhoneNumberId
    ) {
      return { status: 'ignored_company_account_mismatch' }
    }

    if (eventPhoneNumberId && !company.companyPhoneNumberId?.trim()) {
      company.companyPhoneNumberId = eventPhoneNumberId
      await this.companyRepo.save(company)
    }

    const externalAccountId =
      eventPhoneNumberId || company.companyPhoneNumberId?.trim()
    if (!externalAccountId) {
      this.logger.warn(
        `Stopping webhook processing: inbound message ${inboundMessageId} is missing phone_number_id`
      )
      return { status: 'ignored_missing_external_account' }
    }

    if (resolvedMessageType === MessageType.REACTION) {
      return this.handleWhatsAppReaction({
        message,
        externalAccountId,
        externalUserId: from
      })
    }

    this.logger.log(
      `[2] Lead identity lookup started. channel=${LeadChannel.WHATSAPP} externalAccountId=${externalAccountId}`
    )

    const existingIdentity = await this.leadChannelIdentityService.findIdentity(
      {
        channel: LeadChannel.WHATSAPP,
        externalAccountId,
        externalUserId: from
      }
    )
    const legacyLead = existingIdentity
      ? null
      : await this.findLeadByPhone(company.id, from)
    const isButtonMessage = message?.type === 'button'

    if (isButtonMessage && !existingIdentity && !legacyLead) {
      this.logger.warn(
        `Stopping webhook processing: button message ${inboundMessageId} from ${from} but lead not found`
      )
      return { status: 'ignored_button_message_lead_not_found' }
    }

    const shouldUseProfileName = this.hasValidLeadName(profileName)
    const identityResolution =
      await this.leadChannelIdentityService.findOrCreateLeadForIdentity({
        channel: LeadChannel.WHATSAPP,
        externalAccountId,
        externalUserId: from,
        profileName,
        lastInteractionAt:
          this.parseWhatsAppTimestamp(message?.timestamp) ?? new Date(),
        legacyLeadId: legacyLead?.id,
        leadDraft: {
          companyId: company.id,
          name: shouldUseProfileName ? profileName!.trim() : undefined,
          flowState: shouldUseProfileName
            ? LeadFlowState.ASKING_LOCATION
            : LeadFlowState.ASKING_NAME,
          phone: from,
          source: leadSource,
          metaAdId,
          googleAdId,
          state: LeadState.ACTIVE,
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          lastInboundMessageId: inboundMessageId,
          lastActivityAt: new Date()
        }
      })
    let lead = this.leadWriter.track(identityResolution.lead)

    if (lead.companyId !== company.id) {
      this.logger.error(
        `Stopping webhook processing: channel identity ${identityResolution.identity.id} belongs to a different Flow account`
      )
      return { status: 'ignored_identity_owner_mismatch' }
    }

    this.logger.log(
      identityResolution.leadCreated
        ? `[6] Lead created for WhatsApp identity ${identityResolution.identity.id}: ${lead.id}`
        : `[6] Lead found for WhatsApp identity ${identityResolution.identity.id}: ${lead.id}`
    )

    // idempotência
    if (
      !identityResolution.leadCreated &&
      lead.lastInboundMessageId === inboundMessageId
    ) {
      this.logger.warn(
        `Stopping webhook processing: inbound message ${inboundMessageId} is a duplicate for lead ${lead.id}`
      )
      return { status: 'ignored_duplicate_message' }
    }

    // PRIMEIRO CONTATO (via anúncio)
    if (identityResolution.leadCreated) {
      this.logger.log(
        `[7] Persisting inbound message ${inboundMessageId} for new lead draft`
      )

      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })

      if (!isTextMessage) {
        return this.processInboundMediaMessage({
          lead,
          company,
          message,
          inboundMessageId
        })
      }

      const persistedMessageResult = await this.persistMessage({
        leadId: lead.id,
        leadName: lead.name,
        companyId: company.id,
        message
      })

      if (persistedMessageResult.wasCreated) {
        await this.emitMessageCreated(persistedMessageResult.message)
      }

      lead = await this.leadWriter.findOneOrFail({
        where: {
          id: lead.id
        }
      })

      const reply = shouldUseProfileName
        ? 'Olá! 👋 \nDa onde você fala?'
        : 'Olá! 👋 \nComo podemos te chamar?'

      await this.automaticReplyService.queue({
        leadId: lead.id,
        company,
        channel: MessageChannel.WHATSAPP,
        content: reply,
        externalAccountId,
        to: from
      })

      this.logger.log('[10] Saving lead after first auto-reply dispatch')
      await this.leadWriter.save(lead)

      return { status: 'created_and_replied', leadId: lead.id }
    }

    // BUTTON MESSAGE: lead existe, apenas persistir mensagem
    if (isButtonMessage) {
      this.logger.log(
        `[7] Persisting button message ${inboundMessageId} for existing lead ${lead.id}`
      )

      const persistedMessageResult = await this.persistMessage({
        leadId: lead.id,
        leadName: lead.name,
        companyId: company.id,
        message
      })

      if (persistedMessageResult.wasCreated) {
        await this.emitMessageCreated(persistedMessageResult.message)
      }

      lead = await this.leadWriter.findOneOrFail({
        where: { id: lead.id }
      })

      lead.lastInboundMessageId = inboundMessageId ?? undefined
      lead.lastActivityAt = new Date()
      await this.leadWriter.save(lead)

      this.logger.log(
        `[11] Button message processed for lead ${lead.id}, skipping automation`
      )
      return { status: 'button_message_processed', leadId: lead.id }
    }

    this.logger.log(
      `[7] Persisting inbound message ${inboundMessageId} for lead ${lead.id}`
    )

    if (!isTextMessage) {
      return this.processInboundMediaMessage({
        lead,
        company,
        message,
        inboundMessageId
      })
    }

    lead = await this.leadWriter.findOneOrFail({
      where: {
        id: lead.id
      }
    })

    const persistedMessageResult = await this.persistMessage({
      leadId: lead.id,
      leadName: lead.name,
      companyId: company.id,
      message
    })

    if (persistedMessageResult.wasCreated) {
      await this.emitMessageCreated(persistedMessageResult.message)
    }

    lead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
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
      await this.leadWriter.save(lead)

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
      phoneNumberId: externalAccountId,
      externalUserId: from,
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
      sendMessage: async ({ leadId, to, content }) => {
        await this.automaticReplyService.queue({
          leadId,
          company,
          channel: MessageChannel.WHATSAPP,
          content,
          externalAccountId,
          to
        })
      }
    })

    if (
      !this.hasValidLeadName(leadNameBeforeFlowExecution) &&
      this.hasValidLeadName(lead.name)
    ) {
      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })
    }

    lead.lastInboundMessageId = inboundMessageId ?? undefined

    this.logger.log('[10] Saving lead after FlowEngine execution')
    await this.leadWriter.save(lead)

    return { status: 'updated_and_replied', leadId: lead.id }
  }

  /**
   * `deferWhenMissing` (worker): a status for a message not stored yet throws
   * `DeferredInboundEventError`, so it is retried instead of dropped.
   */
  private async handleMessageStatuses(
    statuses: WhatsAppMessageStatus[],
    options: { deferWhenMissing?: boolean } = {}
  ) {
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
        where: {
          channel: MessageChannel.WHATSAPP,
          externalMessageId: whatsappMessageId
        }
      })

      if (!message) {
        if (options.deferWhenMissing) {
          throw new DeferredInboundEventError('status_target_not_found')
        }

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
      const updatedMessage = await this.messageRepo.save(message)
      const responseMessage =
        await this.leadsService.toResponseMessageDto(updatedMessage)

      this.realtimeService.emitToLead(
        updatedMessage.leadId,
        'message.updated',
        responseMessage
      )

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
    companyId: string
    message: WhatsAppInboundMessage
  }): Promise<{ message: Message; wasCreated: boolean }> {
    const { leadId, leadName, companyId, message } = params

    const resolvedMessageType = this.resolveMessageType(message?.type)
    let content: string | null = this.resolveInboundMessageContent(message)
    let metaMediaId: string | null = null
    let mimeType: string | null = null
    let mediaSha256: string | null = null
    let fileName: string | null = null
    const metadata: Record<string, unknown> | null = message as Record<
      string,
      unknown
    >

    switch (resolvedMessageType) {
      case MessageType.AUDIO:
        content = null
        metaMediaId = message?.audio?.id ?? null
        mimeType = message?.audio?.mime_type ?? null
        mediaSha256 = message?.audio?.sha256 ?? null
        break
      case MessageType.IMAGE:
        content = message?.image?.caption ?? null
        metaMediaId = message?.image?.id ?? null
        mimeType = message?.image?.mime_type ?? null
        mediaSha256 = message?.image?.sha256 ?? null
        break
      case MessageType.VIDEO:
        content = message?.video?.caption ?? null
        metaMediaId = message?.video?.id ?? null
        mimeType = message?.video?.mime_type ?? null
        mediaSha256 = message?.video?.sha256 ?? null
        break
      case MessageType.DOCUMENT:
        content = message?.document?.caption ?? null
        metaMediaId = message?.document?.id ?? null
        mimeType = message?.document?.mime_type ?? null
        mediaSha256 = message?.document?.sha256 ?? null
        fileName = message?.document?.filename ?? null
        break
      case MessageType.TEXT:
      default:
        break
    }

    const inboundMessage = this.messageRepo.create({
      leadId,
      direction: MessageDirection.INBOUND,
      channel: MessageChannel.WHATSAPP,
      content,
      type: resolvedMessageType,
      externalMessageId: message?.id ?? null,
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
          where: {
            channel: MessageChannel.WHATSAPP,
            externalMessageId: whatsappMessageId
          }
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

      await this.followUpReplyLinkerService.linkReply(savedMessage)

      await this.outboxService.publish('message.received', {
        messageId: savedMessage.id,
        leadId,
        leadName: leadName ?? null,
        companyId,
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

  private async processInboundMediaMessage(params: {
    lead: Lead
    company: Company
    message: WhatsAppInboundMessage
    inboundMessageId: string
  }): Promise<{ status: string; leadId: string }> {
    const { lead, company, message, inboundMessageId } = params
    const companyId = company.id

    const persistedMessageResult = await this.persistMessage({
      leadId: lead.id,
      leadName: lead.name,
      companyId,
      message
    })

    const persistedMessage = persistedMessageResult.message
    const isContactMessage = persistedMessage.type === MessageType.CONTACT

    const metaMediaId = persistedMessage.metaMediaId?.trim()
    if (!isContactMessage && metaMediaId && !persistedMessage.mediaUrl) {
      await this.inboundMediaService.attach(persistedMessage, company, {
        kind: 'whatsapp',
        metaMediaId
      })
    }

    if (persistedMessageResult.wasCreated) {
      await this.emitMessageCreated(persistedMessage)
    }

    const refreshedLead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
    })

    refreshedLead.lastInboundMessageId = inboundMessageId
    refreshedLead.lastActivityAt = new Date()

    this.logger.log('[10] Saving lead after media message processing')
    await this.leadWriter.save(refreshedLead)

    return {
      status: isContactMessage
        ? 'contact_message_processed'
        : 'media_message_processed',
      leadId: lead.id
    }
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

  private async handleWhatsAppReaction(params: {
    message: WhatsAppInboundMessage
    externalAccountId: string
    externalUserId: string
  }): Promise<{ status: string; messageId?: string }> {
    const targetExternalMessageId = params.message.reaction?.message_id?.trim()

    if (!targetExternalMessageId) {
      this.logger.warn(
        'Ignoring WhatsApp reaction: target message ID is missing'
      )
      return { status: 'ignored_reaction_missing_target' }
    }

    const targetMessage = await this.messageRepo.findOne({
      where: {
        channel: MessageChannel.WHATSAPP,
        externalMessageId: targetExternalMessageId
      }
    })

    if (!targetMessage) {
      this.logger.warn(
        `Ignoring WhatsApp reaction: target message not found. externalMessageId=${targetExternalMessageId}`
      )
      return { status: 'ignored_reaction_target_not_found' }
    }

    const senderIdentity = await this.leadChannelIdentityService.findIdentity({
      channel: LeadChannel.WHATSAPP,
      externalAccountId: params.externalAccountId,
      externalUserId: params.externalUserId
    })

    if (!senderIdentity || senderIdentity.leadId !== targetMessage.leadId) {
      this.logger.warn(
        `Ignoring WhatsApp reaction: sender does not belong to the target conversation. messageId=${targetMessage.id}`
      )
      return { status: 'ignored_reaction_conversation_mismatch' }
    }

    const metadata = { ...(targetMessage.metadata ?? {}) }
    const emoji = params.message.reaction?.emoji?.trim()

    if (emoji) {
      metadata.reaction = {
        emoji,
        externalUserId: params.externalUserId,
        reactedAt:
          this.parseWhatsAppTimestamp(
            params.message.timestamp
          )?.toISOString() ?? new Date().toISOString()
      }
    } else {
      delete metadata.reaction
    }

    targetMessage.metadata = Object.keys(metadata).length ? metadata : null
    const updatedMessage = await this.messageRepo.save(targetMessage)
    const responseMessage =
      await this.leadsService.toResponseMessageDto(updatedMessage)

    this.realtimeService.emitToLead(
      targetMessage.leadId,
      'message.updated',
      responseMessage
    )

    return {
      status: emoji ? 'reaction_processed' : 'reaction_removed',
      messageId: targetMessage.id
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

  private async findLeadByPhone(
    companyId: string,
    phone: string
  ): Promise<Lead | null> {
    const variants = buildBrazilianPhoneVariants(phone)

    return this.leadWriter.findOne({
      where: variants.map((variant) => ({
        companyId,
        phone: variant,
        state: LeadState.ACTIVE
      }))
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
      case 'contacts':
      case MessageType.CONTACT:
        return MessageType.CONTACT
      case MessageType.REACTION:
        return MessageType.REACTION
      case MessageType.BUTTON:
        return MessageType.BUTTON
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

  private resolveInboundContactProfileName(
    contacts?: Array<{
      profile?: {
        name?: string
      }
    }>
  ): string | null {
    const rawName = contacts?.[0]?.profile?.name

    if (!rawName) {
      return null
    }

    const normalizedName = rawName.trim()
    if (!normalizedName) {
      return null
    }

    return normalizedName
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

  async handleMessengerWebhook(payload: MessengerWebhookPayload) {
    this.logger.log(
      `Received Messenger webhook. entries=${payload.entry?.length ?? 0}`
    )

    const { events: inboundEvents, skipped } =
      normalizeMessengerWebhook(payload)
    this.logSkippedInboundItems(skipped)

    for (const inboundEvent of inboundEvents) {
      await this.inboundEventInbox.run(
        inboundEvent,
        () => this.processMessengerEvent(inboundEvent),
        toSocialInboxOutcome
      )
    }

    return { status: 'received' }
  }

  private async processMessengerEvent(
    inboundEvent: MessengerInboundEvent
  ): Promise<SocialEventResult> {
    const { event } = inboundEvent.payload
    const pageId = inboundEvent.externalAccountId ?? undefined
    const psid = event.sender?.id?.trim()
    const inboundMessageId = event.message?.mid?.trim()
    const messageText = event.message?.text?.trim()
    const attachment = event.message?.attachments?.find((item) =>
      Boolean(item.payload?.url?.trim())
    )
    const attachmentType = this.resolveSocialAttachmentMessageType(
      attachment?.type
    )

    if (event.message?.is_echo) {
      return ignoredSocialEvent('echo')
    }

    if (
      !pageId ||
      !psid ||
      !inboundMessageId ||
      ((!messageText || !messageText.length) && !attachmentType)
    ) {
      this.logger.warn(
        'Ignoring Messenger event: Page ID, PSID, message ID and supported content are required'
      )
      return ignoredSocialEvent('missing_required_fields')
    }

    const existingMessage = await this.messageRepo.findOne({
      where: {
        channel: MessageChannel.MESSENGER,
        externalMessageId: inboundMessageId
      }
    })

    if (existingMessage) {
      this.logger.warn(
        `Ignoring duplicate Messenger message ${inboundMessageId}`
      )
      return ignoredSocialEvent('duplicate_message')
    }

    const company = await this.companyRepo.findOne({
      where: { messengerPageId: pageId }
    })

    if (!company) {
      this.logger.warn(
        'Ignoring Messenger event: no Company is connected to the receiving Page'
      )
      return ignoredSocialEvent('missing_company')
    }

    if (!company.messengerToken?.trim()) {
      throw new BadRequestException(
        'Messenger token is not configured for this company'
      )
    }

    const existingIdentity = await this.leadChannelIdentityService.findIdentity(
      {
        channel: LeadChannel.MESSENGER,
        externalAccountId: pageId,
        externalUserId: psid
      }
    )

    let profileName: string | null = null
    let profilePictureUrl: string | null = null

    if (!existingIdentity && company.messengerToken?.trim()) {
      try {
        const { data: profile } =
          await this.messengerMessagingService.getMessengerUserInfo(
            psid,
            company.messengerToken
          )

        profileName = [profile.first_name, profile.last_name]
          .filter(Boolean)
          .join(' ')
          .trim()
        profilePictureUrl = profile.profile_pic?.trim() || null
      } catch {
        this.logger.warn(
          'Could not load the Messenger profile; creating the Lead without profile data'
        )
      }
    }

    const interactionAt = event.timestamp
      ? new Date(event.timestamp)
      : new Date()

    const shouldUseProfileName = this.hasValidLeadName(profileName)
    const identityResolution =
      await this.leadChannelIdentityService.findOrCreateLeadForIdentity({
        channel: LeadChannel.MESSENGER,
        externalAccountId: pageId,
        externalUserId: psid,
        profileName,
        profilePictureUrl,
        lastInteractionAt: interactionAt,
        leadDraft: {
          companyId: company.id,
          name: shouldUseProfileName ? profileName!.trim() : undefined,
          source: LeadChannel.MESSENGER,
          flowState: shouldUseProfileName
            ? LeadFlowState.ASKING_LOCATION
            : LeadFlowState.ASKING_NAME,
          state: LeadState.ACTIVE,
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          lastInboundMessageId: inboundMessageId,
          lastActivityAt: interactionAt
        }
      })
    let lead = this.leadWriter.track(identityResolution.lead)

    if (lead.companyId !== company.id) {
      this.logger.error(
        `Ignoring Messenger identity ${identityResolution.identity.id}: it belongs to another Company`
      )
      return ignoredSocialEvent('identity_owner_mismatch')
    }

    const persistedMessageResult = await this.persistSocialInboundMessage({
      channel: MessageChannel.MESSENGER,
      leadId: lead.id,
      leadName: lead.name,
      companyId: company.id,
      externalAccountId: pageId,
      externalUserId: psid,
      externalMessageId: inboundMessageId,
      content: messageText || null,
      externalTimestamp: interactionAt,
      type: attachmentType ?? MessageType.TEXT
    })

    if (!persistedMessageResult.wasCreated) {
      return ignoredSocialEvent('duplicate_message')
    }

    const attachmentUrl = attachmentType ? attachment?.payload?.url : undefined
    if (attachmentUrl) {
      await this.inboundMediaService.attach(
        persistedMessageResult.message,
        company,
        { kind: 'url', url: attachmentUrl }
      )
    }

    await this.emitMessageCreated(persistedMessageResult.message)

    lead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
    })

    if (identityResolution.leadCreated) {
      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })

      const reply = shouldUseProfileName
        ? 'Olá! 👋 \nDa onde você fala?'
        : 'Olá! 👋 \nComo podemos te chamar?'
      await this.automaticReplyService.queue({
        leadId: lead.id,
        company,
        channel: MessageChannel.MESSENGER,
        content: reply,
        externalAccountId: pageId,
        to: psid
      })
      await this.leadWriter.save(lead)
      return processedSocialEvent('first_contact_replied', lead.id)
    }

    lead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
    })

    if (!messageText) {
      lead.lastInboundMessageId = inboundMessageId
      lead.lastActivityAt = interactionAt
      await this.leadWriter.save(lead)
      return processedSocialEvent('attachment_saved', lead.id)
    }

    const conversationContext = await this.conversationContextBuilder.build({
      lead
    })
    const conversationType = classifyConversation(conversationContext)
    const shouldRunAutomation = canRunAutomation({
      lead,
      conversationType
    })

    if (!shouldRunAutomation) {
      lead.lastInboundMessageId = inboundMessageId
      lead.lastActivityAt = interactionAt
      await this.leadWriter.save(lead)
      return processedSocialEvent('human_mode', lead.id)
    }

    const flowResult = this.leadFlowEngine.process({
      lead,
      messageText,
      conversationContext
    })
    const actionContext: LeadFlowActionContext = {
      trigger: 'webhook',
      phoneNumberId: pageId,
      externalUserId: psid,
      inboundMessageId,
      correlationId: randomUUID()
    }
    const leadNameBeforeFlowExecution = lead.name

    await this.leadFlowActionExecutor.execute({
      context: actionContext,
      lead,
      actions: flowResult.actions,
      transitionLeadFlowState: ({ lead: transitionLead, to }) =>
        this.transitionLeadFlowState({ lead: transitionLead, to }),
      sendMessage: async ({ leadId, to, content }) => {
        await this.automaticReplyService.queue({
          leadId,
          company,
          channel: MessageChannel.MESSENGER,
          content,
          externalAccountId: pageId,
          to
        })
      }
    })

    if (
      !this.hasValidLeadName(leadNameBeforeFlowExecution) &&
      this.hasValidLeadName(lead.name)
    ) {
      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })
    }

    lead.lastInboundMessageId = inboundMessageId
    lead.lastActivityAt = interactionAt
    await this.leadWriter.save(lead)

    return processedSocialEvent('flow_executed', lead.id)
  }

  private async persistSocialInboundMessage(
    params: {
      channel: MessageChannel.MESSENGER | MessageChannel.INSTAGRAM
      leadId: string
      leadName?: string | null
      externalAccountId: string
      externalUserId: string
      externalMessageId: string
      content: string | null
      externalTimestamp: Date
      type?: MessageType
      mediaUrl?: string | null
      mimeType?: string | null
      mediaSize?: number | null
    } & (
      | { companyId: string; userId?: never }
      | { userId: string; companyId?: never }
    )
  ): Promise<{ message: Message; wasCreated: boolean }> {
    const {
      channel,
      leadId,
      leadName,
      userId,
      companyId,
      externalAccountId,
      externalUserId,
      externalMessageId,
      content,
      externalTimestamp,
      type = MessageType.TEXT,
      mediaUrl = null,
      mimeType = null,
      mediaSize = null
    } = params
    const inboundMessage = this.messageRepo.create({
      leadId,
      direction: MessageDirection.INBOUND,
      channel,
      content,
      type,
      externalMessageId,
      externalTimestamp,
      mediaUrl,
      mimeType,
      mediaSize,
      metadata: {
        externalAccountId,
        externalUserId
      }
    })

    try {
      const savedMessage = await this.messageRepo.save(inboundMessage)

      await this.followUpReplyLinkerService.linkReply(savedMessage)

      await this.outboxService.publish('message.received', {
        messageId: savedMessage.id,
        leadId,
        leadName: leadName ?? null,
        ...(companyId ? { companyId } : { userId }),
        organizationId: null,
        createdAt: savedMessage.createdAt
      })

      return { message: savedMessage, wasCreated: true }
    } catch (error) {
      const existingMessage = await this.messageRepo.findOne({
        where: {
          channel,
          externalMessageId
        }
      })

      if (existingMessage) {
        return { message: existingMessage, wasCreated: false }
      }

      throw error
    }
  }

  private resolveSocialAttachmentMessageType(
    attachmentType?: string
  ): MessageType | null {
    switch (attachmentType?.trim().toLowerCase()) {
      case 'audio':
        return MessageType.AUDIO
      case 'image':
        return MessageType.IMAGE
      case 'video':
        return MessageType.VIDEO
      case 'file':
        return MessageType.DOCUMENT
      default:
        return null
    }
  }

  async handleDirectWebhook(payload: InstagramDirectWebhookPayload) {
    this.logger.log(
      `Received Instagram Direct webhook. entries=${payload.entry?.length ?? 0}`
    )

    const { events: inboundEvents, skipped } =
      normalizeInstagramWebhook(payload)
    this.logSkippedInboundItems(skipped)

    for (const inboundEvent of inboundEvents) {
      await this.inboundEventInbox.run(
        inboundEvent,
        () => this.processInstagramEvent(inboundEvent),
        toSocialInboxOutcome
      )
    }

    return { status: 'received' }
  }

  private async processInstagramEvent(
    inboundEvent: InstagramInboundEvent
  ): Promise<SocialEventResult> {
    const { event } = inboundEvent.payload
    const instagramAccountId = inboundEvent.externalAccountId ?? undefined
    const instagramUserId = inboundEvent.externalUserId ?? undefined

    if (event.message?.is_echo) {
      return ignoredSocialEvent('echo')
    }

    const company = instagramAccountId
      ? await this.companyRepo.findOne({ where: { instagramAccountId } })
      : null

    if (!company) {
      this.logger.warn(
        `Ignoring Instagram Direct event: no Company is connected to instagramAccountId=${instagramAccountId ?? 'missing'}`
      )
      return ignoredSocialEvent('missing_company')
    }

    if (event.reaction) {
      await this.handleInstagramDirectReaction({
        companyId: company.id,
        externalAccountId: instagramAccountId,
        externalUserId: instagramUserId,
        timestamp: event.timestamp,
        reaction: event.reaction
      })
      return processedSocialEvent('reaction')
    }

    const inboundMessageId = event.message?.mid?.trim()
    const messageText = event.message?.text?.trim()
    const attachment = event.message?.attachments?.find((item) =>
      Boolean(item.payload?.url?.trim())
    )
    const attachmentType = this.resolveSocialAttachmentMessageType(
      attachment?.type
    )

    if (
      !instagramAccountId ||
      !instagramUserId ||
      !inboundMessageId ||
      ((!messageText || !messageText.length) && !attachmentType)
    ) {
      this.logger.warn(
        'Ignoring Instagram Direct event: Account ID, User ID, message ID and supported content are required'
      )
      return ignoredSocialEvent('missing_required_fields')
    }

    const existingMessage = await this.messageRepo.findOne({
      where: {
        channel: MessageChannel.INSTAGRAM,
        externalMessageId: inboundMessageId
      }
    })

    if (existingMessage) {
      this.logger.warn(
        `Ignoring duplicate Instagram Direct message ${inboundMessageId}`
      )
      return ignoredSocialEvent('duplicate_message')
    }

    if (!company.instagramToken?.trim()) {
      this.logger.warn(
        `Ignoring Instagram Direct message: token is not configured for companyId=${company.id}`
      )
      return ignoredSocialEvent('missing_token')
    }

    const existingIdentity = await this.leadChannelIdentityService.findIdentity(
      {
        channel: LeadChannel.INSTAGRAM,
        externalAccountId: instagramAccountId,
        externalUserId: instagramUserId
      }
    )

    let profileName: string | null = null
    let profilePictureUrl: string | null = null

    if (!existingIdentity) {
      try {
        const profile =
          await this.instagramMessagingService.getInstagramUserProfile(
            instagramAccountId,
            instagramUserId
          )

        profileName = profile.name?.trim() || null
        profilePictureUrl = profile.profile_pic?.trim() || null
      } catch {
        this.logger.warn(
          'Could not load the Instagram Direct profile; creating the Lead without profile data'
        )
      }
    }

    const interactionAt = event.timestamp
      ? new Date(event.timestamp)
      : new Date()
    const shouldUseProfileName = this.hasValidLeadName(profileName)
    const identityResolution =
      await this.leadChannelIdentityService.findOrCreateLeadForIdentity({
        channel: LeadChannel.INSTAGRAM,
        externalAccountId: instagramAccountId,
        externalUserId: instagramUserId,
        profileName,
        profilePictureUrl,
        lastInteractionAt: interactionAt,
        leadDraft: {
          companyId: company.id,
          name: shouldUseProfileName ? profileName!.trim() : undefined,
          source: 'direct',
          flowState: shouldUseProfileName
            ? LeadFlowState.ASKING_LOCATION
            : LeadFlowState.ASKING_NAME,
          state: LeadState.ACTIVE,
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          lastInboundMessageId: inboundMessageId,
          lastActivityAt: interactionAt
        }
      })
    let lead = this.leadWriter.track(identityResolution.lead)

    if (lead.companyId !== company.id) {
      this.logger.error(
        `Ignoring Instagram identity ${identityResolution.identity.id}: it belongs to another Company`
      )
      return ignoredSocialEvent('identity_owner_mismatch')
    }

    const persistedMessageResult = await this.persistSocialInboundMessage({
      channel: MessageChannel.INSTAGRAM,
      leadId: lead.id,
      leadName: lead.name,
      companyId: company.id,
      externalAccountId: instagramAccountId,
      externalUserId: instagramUserId,
      externalMessageId: inboundMessageId,
      content: messageText || null,
      externalTimestamp: interactionAt,
      type: attachmentType ?? MessageType.TEXT
    })

    if (!persistedMessageResult.wasCreated) {
      return ignoredSocialEvent('duplicate_message')
    }

    const attachmentUrl = attachmentType ? attachment?.payload?.url : undefined
    if (attachmentUrl) {
      await this.inboundMediaService.attach(
        persistedMessageResult.message,
        company,
        { kind: 'url', url: attachmentUrl }
      )
    }

    await this.emitMessageCreated(persistedMessageResult.message)

    lead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
    })

    if (identityResolution.leadCreated) {
      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })

      const reply = shouldUseProfileName
        ? 'Olá! 👋 \nDa onde você fala?'
        : 'Olá! 👋 \nComo podemos te chamar?'
      await this.automaticReplyService.queue({
        leadId: lead.id,
        company,
        channel: MessageChannel.INSTAGRAM,
        content: reply,
        externalAccountId: instagramAccountId,
        to: instagramUserId
      })
      await this.leadWriter.save(lead)
      return processedSocialEvent('first_contact_replied', lead.id)
    }

    lead = await this.leadWriter.findOneOrFail({
      where: { id: lead.id }
    })

    if (!messageText) {
      lead.lastInboundMessageId = inboundMessageId
      lead.lastActivityAt = interactionAt
      await this.leadWriter.save(lead)
      return processedSocialEvent('attachment_saved', lead.id)
    }

    const conversationContext = await this.conversationContextBuilder.build({
      lead
    })
    const conversationType = classifyConversation(conversationContext)
    const shouldRunAutomation = canRunAutomation({
      lead,
      conversationType
    })

    if (!shouldRunAutomation) {
      lead.lastInboundMessageId = inboundMessageId
      lead.lastActivityAt = interactionAt
      await this.leadWriter.save(lead)
      return processedSocialEvent('human_mode', lead.id)
    }

    const flowResult = this.leadFlowEngine.process({
      lead,
      messageText,
      conversationContext
    })
    const actionContext: LeadFlowActionContext = {
      trigger: 'webhook',
      phoneNumberId: instagramAccountId,
      externalUserId: instagramUserId,
      inboundMessageId,
      correlationId: randomUUID()
    }
    const leadNameBeforeFlowExecution = lead.name

    await this.leadFlowActionExecutor.execute({
      context: actionContext,
      lead,
      actions: flowResult.actions,
      transitionLeadFlowState: ({ lead: transitionLead, to }) =>
        this.transitionLeadFlowState({ lead: transitionLead, to }),
      sendMessage: async ({ leadId, to, content }) => {
        await this.automaticReplyService.queue({
          leadId,
          company,
          channel: MessageChannel.INSTAGRAM,
          content,
          externalAccountId: instagramAccountId,
          to
        })
      }
    })

    if (
      !this.hasValidLeadName(leadNameBeforeFlowExecution) &&
      this.hasValidLeadName(lead.name)
    ) {
      await this.outboxService.publish('lead.created', {
        leadId: lead.id,
        companyId: company.id,
        origin: 'webhook',
        organizationId: null,
        leadName: lead.name,
        description: lead.name,
        source: lead.source ?? null,
        createdAt: lead.createdAt
      })
    }

    lead.lastInboundMessageId = inboundMessageId
    lead.lastActivityAt = interactionAt
    await this.leadWriter.save(lead)

    return processedSocialEvent('flow_executed', lead.id)
  }

  private async handleInstagramDirectReaction(params: {
    companyId: string
    externalAccountId?: string
    externalUserId?: string
    timestamp?: number
    reaction: {
      mid?: string
      action?: string
      emoji?: string | null
    }
  }): Promise<void> {
    const externalAccountId = params.externalAccountId?.trim()
    const externalUserId = params.externalUserId?.trim()
    const targetExternalMessageId = params.reaction.mid?.trim()

    if (!externalAccountId || !externalUserId || !targetExternalMessageId) {
      this.logger.warn(
        'Ignoring Instagram Direct reaction: account, sender and target message ID are required'
      )
      return
    }

    const targetMessage = await this.messageRepo.findOne({
      where: {
        channel: MessageChannel.INSTAGRAM,
        externalMessageId: targetExternalMessageId
      }
    })

    if (!targetMessage) {
      this.logger.warn(
        `Ignoring Instagram Direct reaction: target message not found. externalMessageId=${targetExternalMessageId}`
      )
      return
    }

    const senderIdentity = await this.leadChannelIdentityService.findIdentity({
      channel: LeadChannel.INSTAGRAM,
      externalAccountId,
      externalUserId
    })

    const targetLead = await this.leadWriter.findOne({
      where: { id: targetMessage.leadId }
    })

    if (
      !senderIdentity ||
      senderIdentity.leadId !== targetMessage.leadId ||
      targetLead?.companyId !== params.companyId
    ) {
      this.logger.warn(
        `Ignoring Instagram Direct reaction: sender does not belong to the target conversation. messageId=${targetMessage.id}`
      )
      return
    }

    const metadata = { ...(targetMessage.metadata ?? {}) }
    const emoji = params.reaction.emoji?.trim()
    const normalizedEmoji = emoji === '❤' ? '❤️' : emoji
    const isReactionRemoved =
      params.reaction.action?.trim().toLowerCase() === 'unreact' || !emoji

    if (isReactionRemoved) {
      delete metadata.reaction
    } else {
      metadata.reaction = {
        emoji: normalizedEmoji,
        externalUserId,
        reactedAt: params.timestamp
          ? new Date(params.timestamp).toISOString()
          : new Date().toISOString()
      }
    }

    targetMessage.metadata = Object.keys(metadata).length ? metadata : null
    const updatedMessage = await this.messageRepo.save(targetMessage)
    const responseMessage =
      await this.leadsService.toResponseMessageDto(updatedMessage)

    this.realtimeService.emitToLead(
      targetMessage.leadId,
      'message.updated',
      responseMessage
    )
  }
}

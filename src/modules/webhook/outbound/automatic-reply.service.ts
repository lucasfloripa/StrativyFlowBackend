import { HttpException, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { isAxiosError } from 'axios'
import { Repository } from 'typeorm'

import { Company } from '../../company/company.entity'
import { Lead, LeadRuntimeMode } from '../../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  MessageType
} from '../../leads/entities/message.entity'
import { LeadsService } from '../../leads/leads.service'
import { OutboxService } from '../../outbox/services/outbox.service'
import {
  REALTIME_EMITTER,
  type RealtimeEmitter
} from '../../realtime/realtime-emitter'
import { InstagramMessagingService } from '../instagram-messaging.service'
import { MessengerMessagingService } from '../messenger-messaging.service'
import { isWebhookAsyncProcessingEnabled } from '../webhook-async.flag'
import { sendWhatsAppMessage } from '../whatsapp-messaging.service'

import {
  MESSAGE_OUTBOUND_SEND_ROUTING_KEY,
  type OutboundReplyJob,
  type OutboundReplyTarget
} from './outbound-reply.constants'

import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

export type QueueAutomaticReplyParams = {
  leadId: string
  company: Company
  channel: MessageChannel
  content: string
  /** phone_number_id, Page ID or Instagram account ID that sends it. */
  externalAccountId: string
  /** WhatsApp number, PSID or Instagram-scoped user ID. */
  to: string
}

export type DeliveryResult = 'sent' | 'failed' | 'already_sent' | 'missing'

const MAX_ERROR_LENGTH = 500

/**
 * Automatic replies as commands. The reply is stored first as a `queued`
 * message, then sent; the Graph API message ID turns it `sent`. A send that
 * failed after the message was stored used to be lost (and Meta's redelivery
 * was then ignored as a duplicate): now it is retried or marked `failed`,
 * and the chat shows it.
 */
@Injectable()
export class AutomaticReplyService {
  private readonly logger = new Logger(AutomaticReplyService.name)

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
    private readonly messengerMessagingService: MessengerMessagingService,
    private readonly instagramMessagingService: InstagramMessagingService,
    private readonly leadsService: LeadsService,
    @Inject(REALTIME_EMITTER)
    private readonly realtimeService: RealtimeEmitter
  ) {}

  /**
   * Stores the reply as `queued`. With `WEBHOOK_ASYNC_PROCESSING` the worker
   * sends it (`message.outbound.send`, after COMMIT); otherwise it is sent
   * right away, once, and marked `failed` if that fails.
   */
  async queue(params: QueueAutomaticReplyParams): Promise<Message> {
    const target: OutboundReplyTarget = {
      companyId: params.company.id,
      externalAccountId: params.externalAccountId,
      to: params.to,
      attempts: 0
    }
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        leadId: params.leadId,
        direction: MessageDirection.AUTOMATIC,
        channel: params.channel,
        content: params.content,
        type: MessageType.TEXT,
        status: MessageStatus.QUEUED,
        externalMessageId: null,
        metadata: {
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          outbound: target
        }
      })
    )

    if (isWebhookAsyncProcessingEnabled(this.configService)) {
      const job: OutboundReplyJob = { messageId: message.id }
      await this.outboxService.publish(MESSAGE_OUTBOUND_SEND_ROUTING_KEY, job)
    } else {
      await this.deliver(message, params.company, target, true)
    }

    return message
  }

  /**
   * Worker path: sends a queued reply. A temporary failure is rethrown for a
   * RabbitMQ retry until `maxAttempts`; then, or on a permanent failure,
   * the message is marked `failed`.
   */
  async deliverQueued(
    messageId: string,
    maxAttempts: number
  ): Promise<DeliveryResult> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId }
    })

    if (!message) {
      this.logger.warn(`Queued reply not found. messageId=${messageId}`)
      return 'missing'
    }

    const target = readTarget(message)
    if (message.status !== MessageStatus.QUEUED || !target) {
      return 'already_sent'
    }

    const attempt: OutboundReplyTarget = {
      ...target,
      attempts: target.attempts + 1
    }
    message.metadata = { ...message.metadata, outbound: attempt }
    await this.updateMessage(message.id, { metadata: message.metadata })

    const company = await this.companyRepo.findOne({
      where: { id: target.companyId }
    })
    if (!company) {
      await this.markFailed(message, attempt, 'company not found')
      return 'failed'
    }

    return this.deliver(
      message,
      company,
      attempt,
      attempt.attempts >= maxAttempts
    )
  }

  private async deliver(
    message: Message,
    company: Company,
    target: OutboundReplyTarget,
    lastAttempt: boolean
  ): Promise<DeliveryResult> {
    let externalMessageId: string | null

    try {
      externalMessageId = await this.send(message, company, target)
    } catch (error) {
      const permanent = isPermanentSendFailure(error)

      if (!permanent && !lastAttempt) {
        this.logger.warn(
          `Automatic reply send failed, will retry. messageId=${message.id} channel=${message.channel} attempt=${target.attempts} error=${describe(error)}`
        )
        throw error
      }

      await this.markFailed(message, target, describe(error))
      return 'failed'
    }

    message.status = MessageStatus.SENT
    message.externalMessageId = externalMessageId
    await this.updateMessage(message.id, {
      status: MessageStatus.SENT,
      externalMessageId
    })
    if (externalMessageId) {
      await this.leadRepo.update(
        { id: message.leadId },
        { lastAutoReplyMessageId: externalMessageId }
      )
    }

    await this.emitUpdated(message)
    return 'sent'
  }

  private async send(
    message: Message,
    company: Company,
    target: OutboundReplyTarget
  ): Promise<string | null> {
    const content = message.content ?? ''

    switch (message.channel) {
      case MessageChannel.WHATSAPP: {
        const response = await sendWhatsAppMessage(
          target.to,
          content,
          target.externalAccountId,
          company.whatsappToken ?? undefined
        )
        return response?.data?.messages?.[0]?.id ?? null
      }
      case MessageChannel.MESSENGER: {
        const response =
          await this.messengerMessagingService.sendMessengerMessage(
            target.to,
            content,
            target.externalAccountId,
            company.messengerToken ?? undefined
          )
        return response?.data?.message_id ?? null
      }
      case MessageChannel.INSTAGRAM: {
        const response = await this.instagramMessagingService.sendMessage(
          target.externalAccountId,
          target.to,
          content
        )
        return response?.message_id ?? null
      }
      default:
        throw new Error(`Unsupported reply channel ${String(message.channel)}`)
    }
  }

  private async markFailed(
    message: Message,
    target: OutboundReplyTarget,
    reason: string
  ): Promise<void> {
    this.logger.error(
      `Automatic reply not sent. messageId=${message.id} leadId=${message.leadId} channel=${message.channel} attempts=${target.attempts} error=${reason}`
    )

    message.status = MessageStatus.FAILED
    message.metadata = {
      ...message.metadata,
      outbound: { ...target, error: reason.slice(0, MAX_ERROR_LENGTH) }
    }
    await this.updateMessage(message.id, {
      status: MessageStatus.FAILED,
      metadata: message.metadata
    })
    await this.emitUpdated(message)
  }

  private async updateMessage(
    id: string,
    changes: Partial<Message>
  ): Promise<void> {
    // `QueryDeepPartialEntity` cannot express the free-form jsonb metadata.
    await this.messageRepo.update(
      { id },
      changes as QueryDeepPartialEntity<Message>
    )
  }

  private async emitUpdated(message: Message): Promise<void> {
    try {
      this.realtimeService.emitToLead(
        message.leadId,
        'message.updated',
        await this.leadsService.toResponseMessageDto(message)
      )
    } catch (error) {
      this.logger.warn(
        `Failed to emit message.updated for an automatic reply. messageId=${message.id} error=${describe(error)}`
      )
    }
  }
}

function readTarget(message: Message): OutboundReplyTarget | null {
  const target = message.metadata?.outbound as
    | Partial<OutboundReplyTarget>
    | undefined

  return target &&
    typeof target.companyId === 'string' &&
    typeof target.externalAccountId === 'string' &&
    typeof target.to === 'string'
    ? {
        companyId: target.companyId,
        externalAccountId: target.externalAccountId,
        to: target.to,
        attempts: typeof target.attempts === 'number' ? target.attempts : 0
      }
    : null
}

/**
 * 4xx from the Graph API (closed 24 h window, invalid recipient, missing
 * token) will not change on retry; 408, 429, 5xx and network errors may.
 */
export function isPermanentSendFailure(error: unknown): boolean {
  const status = isAxiosError(error)
    ? error.response?.status
    : error instanceof HttpException
      ? error.getStatus()
      : undefined

  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  )
}

function describe(error: unknown): string {
  if (isAxiosError(error)) {
    return `HTTP ${error.response?.status ?? 'no response'} ${error.code ?? ''}`.trim()
  }
  return error instanceof Error ? error.message : String(error)
}

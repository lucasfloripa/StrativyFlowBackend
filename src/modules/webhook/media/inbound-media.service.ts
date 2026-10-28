import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import axios, { isAxiosError } from 'axios'
import { Repository } from 'typeorm'

import { Company } from '../../company/company.entity'
import { Message } from '../../leads/entities/message.entity'
import { LeadsService } from '../../leads/leads.service'
import { OutboxService } from '../../outbox/services/outbox.service'
import {
  REALTIME_EMITTER,
  type RealtimeEmitter
} from '../../realtime/realtime-emitter'
import { StorageService } from '../../storage/storage.service'
import { isAllowedMetaMediaUrl } from '../security/meta-media-url'
import { isWebhookAsyncProcessingEnabled } from '../webhook-async.flag'

import {
  MESSAGE_MEDIA_FETCH_ROUTING_KEY,
  type InboundMediaJob,
  type InboundMediaSource,
  type InboundMediaState
} from './inbound-media.constants'
import { resolveMediaFileExtension } from './media-file-extension'

import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

export const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com/v22.0'
const MAX_ERROR_LENGTH = 500

type WhatsAppMediaResponse = {
  url: string
  mime_type?: string
  file_size?: number
}

type DownloadedMedia = { buffer: Buffer; mimeType: string; size: number }

export type MediaFetchResult =
  | 'stored'
  | 'failed'
  | 'already_stored'
  | 'missing'

/** A failure that a retry cannot fix (refused host, 4xx from Meta). */
class PermanentMediaError extends Error {}

/**
 * Inbound attachments (audio, image, video, document). Downloading from
 * Meta can take up to 30 s, so with `WEBHOOK_ASYNC_PROCESSING` it no longer
 * runs while the conversation is locked: the message is stored without
 * `mediaUrl`, and `InboundMediaWorker` downloads the file, stores it in R2
 * and emits `message.updated`, with its own retries.
 */
@Injectable()
export class InboundMediaService {
  private readonly logger = new Logger(InboundMediaService.name)

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly storageService: StorageService,
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
    private readonly leadsService: LeadsService,
    @Inject(REALTIME_EMITTER)
    private readonly realtimeService: RealtimeEmitter
  ) {}

  /**
   * Gets the attachment of a stored message into R2: later, in the worker
   * (async mode), or right away, once (sync mode, failures are only logged).
   * Updates `message` in place when it is stored right away.
   */
  async attach(
    message: Message,
    company: Company,
    source: InboundMediaSource
  ): Promise<void> {
    const state: InboundMediaState = {
      source,
      companyId: company.id,
      attempts: 0
    }

    if (isWebhookAsyncProcessingEnabled(this.configService)) {
      await this.saveState(message, state)
      const job: InboundMediaJob = { messageId: message.id }
      await this.outboxService.publish(MESSAGE_MEDIA_FETCH_ROUTING_KEY, job)
      return
    }

    await this.fetch(message, company, { ...state, attempts: 1 }, true, false)
  }

  /**
   * Worker path. A temporary failure is rethrown for a RabbitMQ retry until
   * `maxAttempts`; then, or on a permanent failure, the error is recorded in
   * `metadata.media.error` and the chat is told.
   */
  async fetchQueued(
    messageId: string,
    maxAttempts: number
  ): Promise<MediaFetchResult> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId }
    })
    const state = message ? readState(message) : null

    if (!message || !state) {
      this.logger.warn(`Queued media not found. messageId=${messageId}`)
      return 'missing'
    }

    if (message.mediaUrl || state.error) {
      return 'already_stored'
    }

    const attempt = { ...state, attempts: state.attempts + 1 }
    await this.saveState(message, attempt)

    const company = await this.companyRepo.findOne({
      where: { id: state.companyId }
    })
    if (!company) {
      await this.recordFailure(message, attempt, 'company not found', true)
      return 'failed'
    }

    return this.fetch(
      message,
      company,
      attempt,
      attempt.attempts >= maxAttempts,
      true
    )
  }

  private async fetch(
    message: Message,
    company: Company,
    state: InboundMediaState,
    lastAttempt: boolean,
    emit: boolean
  ): Promise<MediaFetchResult> {
    let media: DownloadedMedia

    try {
      media = await this.download(state.source, company)
    } catch (error) {
      const permanent =
        error instanceof PermanentMediaError ||
        (isAxiosError(error) &&
          (error.response?.status ?? 0) >= 400 &&
          (error.response?.status ?? 0) < 500 &&
          error.response?.status !== 408 &&
          error.response?.status !== 429)

      if (!permanent && !lastAttempt) {
        this.logger.warn(
          `Inbound media download failed, will retry. messageId=${message.id} attempt=${state.attempts} error=${describe(error)}`
        )
        throw error
      }

      await this.recordFailure(message, state, describe(error), emit)
      return 'failed'
    }

    const mimeType =
      media.mimeType || message.mimeType?.trim() || 'application/octet-stream'
    const extension = resolveMediaFileExtension(mimeType)
    const name =
      state.source.kind === 'whatsapp'
        ? `${message.id}.${extension}`
        : `${message.externalMessageId}.${extension}`
    const upload = await this.storageService.uploadFile(
      {
        originalname:
          (state.source.kind === 'whatsapp' && message.fileName?.trim()) ||
          name,
        mimetype: mimeType,
        size: media.buffer.length,
        buffer: media.buffer
      },
      { key: `leads/${message.leadId}/messages/${name}` }
    )

    message.mediaUrl = upload.url
    message.mimeType = mimeType
    message.mediaSize = media.size
    await this.updateMessage(message.id, {
      mediaUrl: upload.url,
      mimeType,
      mediaSize: media.size
    })

    if (emit) {
      await this.emitUpdated(message)
    }
    return 'stored'
  }

  private async download(
    source: InboundMediaSource,
    company: Company
  ): Promise<DownloadedMedia> {
    if (source.kind === 'url') {
      if (!isAllowedMetaMediaUrl(source.url)) {
        throw new PermanentMediaError('refused a non-Meta media host')
      }

      const response = await axios.get<ArrayBuffer>(source.url, {
        responseType: 'arraybuffer',
        timeout: MEDIA_DOWNLOAD_TIMEOUT_MS
      })
      const buffer = Buffer.from(response.data)
      const contentType: unknown = response.headers['content-type']

      return {
        buffer,
        mimeType:
          (typeof contentType === 'string'
            ? contentType.split(';')[0]?.trim()
            : null) ?? '',
        size: buffer.length
      }
    }

    const token = company.whatsappToken?.trim()
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const { data: info } = await axios.get<WhatsAppMediaResponse>(
      `${WHATSAPP_GRAPH_URL}/${source.metaMediaId}`,
      { headers, timeout: MEDIA_DOWNLOAD_TIMEOUT_MS }
    )
    const response = await axios.get<ArrayBuffer>(info.url, {
      headers,
      responseType: 'arraybuffer',
      timeout: MEDIA_DOWNLOAD_TIMEOUT_MS
    })
    const buffer = Buffer.from(response.data)

    return {
      buffer,
      mimeType: info.mime_type?.trim() ?? '',
      size: info.file_size ?? buffer.length
    }
  }

  private async recordFailure(
    message: Message,
    state: InboundMediaState,
    reason: string,
    emit: boolean
  ): Promise<void> {
    this.logger.warn(
      `Inbound media not stored. leadId=${message.leadId} messageId=${message.id} attempts=${state.attempts} error=${reason}`
    )

    await this.saveState(message, {
      ...state,
      error: reason.slice(0, MAX_ERROR_LENGTH)
    })
    if (emit) {
      await this.emitUpdated(message)
    }
  }

  private async saveState(
    message: Message,
    state: InboundMediaState
  ): Promise<void> {
    message.metadata = { ...message.metadata, media: state }
    await this.updateMessage(message.id, { metadata: message.metadata })
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
        `Failed to emit message.updated for inbound media. messageId=${message.id} error=${describe(error)}`
      )
    }
  }
}

function readState(message: Message): InboundMediaState | null {
  const state = message.metadata?.media as
    | Partial<InboundMediaState>
    | undefined
  const source = state?.source

  const validSource =
    (source?.kind === 'whatsapp' && typeof source.metaMediaId === 'string') ||
    (source?.kind === 'url' && typeof source.url === 'string')

  return state && validSource && typeof state.companyId === 'string'
    ? {
        source: source,
        companyId: state.companyId,
        attempts: typeof state.attempts === 'number' ? state.attempts : 0,
        ...(typeof state.error === 'string' ? { error: state.error } : {})
      }
    : null
}

function describe(error: unknown): string {
  if (isAxiosError(error)) {
    return `HTTP ${error.response?.status ?? 'no response'} ${error.code ?? ''}`.trim()
  }
  return error instanceof Error ? error.message : String(error)
}

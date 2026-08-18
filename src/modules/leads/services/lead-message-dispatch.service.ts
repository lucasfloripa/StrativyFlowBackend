import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { RealtimeService } from '../../realtime/realtime.service'
import { StorageService } from '../../storage/storage.service'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageType,
  MessageSource
} from '../entities/message.entity'

@Injectable()
export class LeadMessageDispatchService {
  private readonly logger = new Logger(LeadMessageDispatchService.name)

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly storageService: StorageService,
    private readonly realtimeService: RealtimeService
  ) {}

  async persistAndEmitOutboundMessage(params: {
    leadId: string
    content: string | null
    type: MessageType
    source?: MessageSource
    templateType?: string | null
    mediaUrl?: string | null
    metaMediaId?: string | null
    mimeType?: string | null
    mediaSize?: number | null
    fileName?: string | null
    channel?: MessageChannel
    externalMessageId?: string | null
    whatsappMessageId?: string | null
    metadata?: Record<string, unknown>
  }) {
    const savedMessage = await this.messageRepo.save(
      this.messageRepo.create({
        leadId: params.leadId,
        direction: MessageDirection.OUTBOUND,
        channel: params.channel ?? MessageChannel.WHATSAPP,
        content: params.content,
        type: params.type,
        source: params.source ?? MessageSource.NORMAL,
        templateType:
          params.source === MessageSource.TEMPLATE
            ? params.templateType?.trim() || 'UNKNOWN'
            : null,
        mediaUrl: params.mediaUrl ?? null,
        metaMediaId: params.metaMediaId ?? null,
        mimeType: params.mimeType ?? null,
        mediaSize: params.mediaSize ?? null,
        fileName: params.fileName ?? null,
        externalMessageId:
          params.externalMessageId ?? params.whatsappMessageId ?? null,
        metadata: params.metadata ?? null
      })
    )

    const responseMessage = {
      id: savedMessage.id,
      leadId: savedMessage.leadId,
      direction: savedMessage.direction,
      channel: savedMessage.channel,
      content: savedMessage.content ?? null,
      externalTimestamp: savedMessage.externalTimestamp?.toISOString() ?? null,
      type: savedMessage.type,
      externalMessageId: savedMessage.externalMessageId ?? null,
      whatsappMessageId:
        savedMessage.channel === MessageChannel.WHATSAPP
          ? (savedMessage.externalMessageId ?? null)
          : null,
      mediaUrl: await this.resolveMessageMediaUrl(savedMessage),
      mimeType: savedMessage.mimeType ?? null,
      mediaSize: savedMessage.mediaSize ?? null,
      fileName: savedMessage.fileName ?? null,
      status: savedMessage.status ?? null,
      source: savedMessage.source,
      templateType: savedMessage.templateType ?? null,
      metadata: savedMessage.metadata ?? null,
      createdAt: savedMessage.createdAt.toISOString(),
      updatedAt: savedMessage.updatedAt.toISOString()
    }

    try {
      this.realtimeService.emitToLead(
        params.leadId,
        'message.created',
        responseMessage
      )

      this.logger.log(
        `Realtime event emitted. event=message.created leadId=${params.leadId} messageId=${savedMessage.id}`
      )
    } catch (error) {
      this.logger.warn(
        `Failed to emit realtime event message.created. leadId=${params.leadId} messageId=${savedMessage.id} error=${error instanceof Error ? error.message : 'unknown error'}`
      )
    }

    return {
      success: true,
      message: responseMessage
    }
  }

  private async resolveMessageMediaUrl(
    message: Message
  ): Promise<string | null> {
    const mediaKey = this.extractStorageKeyFromMediaUrl(message.mediaUrl)

    if (!mediaKey) return null

    try {
      const response =
        await this.storageService.generateDownloadPresignedUrl(mediaKey)
      return response.url
    } catch (error) {
      this.logger.warn(
        `Failed to generate message media download URL. messageId=${message.id} leadId=${message.leadId} error=${error instanceof Error ? error.message : 'unknown error'}`
      )
      return null
    }
  }

  private extractStorageKeyFromMediaUrl(
    mediaUrl?: string | null
  ): string | null {
    if (!mediaUrl?.trim()) return null

    try {
      const bucketName = process.env.R2_BUCKET_NAME?.trim()
      const pathSegments = new URL(mediaUrl).pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)

      if (!pathSegments.length) return null

      if (bucketName) {
        const bucketIndex = pathSegments.indexOf(bucketName)
        if (bucketIndex >= 0 && bucketIndex < pathSegments.length - 1) {
          return decodeURIComponent(
            pathSegments.slice(bucketIndex + 1).join('/')
          )
        }
      }

      return pathSegments.length > 1
        ? decodeURIComponent(pathSegments.slice(1).join('/'))
        : null
    } catch {
      return null
    }
  }
}

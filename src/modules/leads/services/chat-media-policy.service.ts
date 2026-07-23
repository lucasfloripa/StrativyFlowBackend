import { BadRequestException, Injectable } from '@nestjs/common'
import { basename, extname } from 'path'

import { StorageUploadFile } from '../../storage/storage.service'

import { MessageType } from '../entities/message.entity'
import { OutboundMediaType } from './types/outbound-media.type'

type MediaRule = {
  maxSizeInBytes: number
  allowedMimeTypes: Set<string>
  allowedExtensions: Set<string>
}

export type ValidatedMediaPayload = {
  type: OutboundMediaType
  mimeType: string
  extension: string
  originalName: string
  size: number
}

@Injectable()
export class ChatMediaPolicyService {
  private static readonly MEDIA_RULES: Record<OutboundMediaType, MediaRule> = {
    audio: {
      maxSizeInBytes: 16 * 1024 * 1024,
      allowedMimeTypes: new Set([
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/aac',
        'audio/amr'
      ]),
      allowedExtensions: new Set(['ogg', 'mp3', 'mp4', 'aac', 'amr'])
    },
    image: {
      maxSizeInBytes: 5 * 1024 * 1024,
      allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
      allowedExtensions: new Set(['jpg', 'jpeg', 'png', 'webp'])
    },
    video: {
      maxSizeInBytes: 16 * 1024 * 1024,
      allowedMimeTypes: new Set(['video/mp4', 'video/3gpp']),
      allowedExtensions: new Set(['mp4', '3gp'])
    },
    document: {
      maxSizeInBytes: 100 * 1024 * 1024,
      allowedMimeTypes: new Set([
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]),
      allowedExtensions: new Set([
        'pdf',
        'txt',
        'csv',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx'
      ])
    }
  }

  getSupportedOutboundMessageTypes(): MessageType[] {
    return [
      MessageType.TEXT,
      MessageType.AUDIO,
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.DOCUMENT
    ]
  }

  assertTextMessageIsSupported(): void {
    const supportedTypes = this.getSupportedOutboundMessageTypes()
    if (!supportedTypes.includes(MessageType.TEXT)) {
      throw new BadRequestException(
        'Text messages are not supported by chat media policy.'
      )
    }
  }

  toMessageType(type: OutboundMediaType): MessageType {
    switch (type) {
      case 'audio':
        return MessageType.AUDIO
      case 'image':
        return MessageType.IMAGE
      case 'video':
        return MessageType.VIDEO
      case 'document':
        return MessageType.DOCUMENT
      default:
        return MessageType.DOCUMENT
    }
  }

  validateOutboundMediaPayload(params: {
    type: OutboundMediaType
    file: StorageUploadFile | undefined
  }): ValidatedMediaPayload {
    const { type, file } = params
    const rule = ChatMediaPolicyService.MEDIA_RULES[type]

    if (!rule) {
      throw new BadRequestException('Unsupported media type.')
    }

    if (!file) {
      throw new BadRequestException('Arquivo nao enviado.')
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo vazio.')
    }

    const normalizedMimeType = file.mimetype.trim().toLowerCase()
    const extension = extname(file.originalname).replace('.', '').toLowerCase()

    if (!normalizedMimeType || !rule.allowedMimeTypes.has(normalizedMimeType)) {
      throw new BadRequestException('Unsupported file type.')
    }

    if (!extension || !rule.allowedExtensions.has(extension)) {
      throw new BadRequestException('Unsupported file type.')
    }

    if (file.size > rule.maxSizeInBytes) {
      throw new BadRequestException('File size exceeds the maximum allowed size.')
    }

    const safeOriginalName = basename(file.originalname).trim() || `media.${extension}`

    return {
      type,
      mimeType: normalizedMimeType,
      extension,
      originalName: safeOriginalName,
      size: file.size
    }
  }
}

import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessageSource
} from '../entities/message.entity'

export class ResponseMessageDto {
  id!: string
  leadId!: string
  direction!: MessageDirection
  channel!: MessageChannel
  content?: string | null
  externalTimestamp?: string | null
  type!: MessageType
  externalMessageId?: string | null
  whatsappMessageId?: string | null
  mediaUrl?: string | null
  mimeType?: string | null
  mediaSize?: number | null
  fileName?: string | null
  status?: MessageStatus | null
  source!: MessageSource
  templateType?: string | null
  metadata?: Record<string, unknown> | null
  createdAt!: string
  updatedAt!: string
}

import {
  MessageDirection,
  MessageStatus,
  MessageType
} from '../entities/message.entity'

export class ResponseMessageDto {
  id!: string
  leadId!: string
  direction!: MessageDirection
  content?: string | null
  externalTimestamp?: string | null
  type!: MessageType
  whatsappMessageId?: string | null
  mediaUrl?: string | null
  mimeType?: string | null
  mediaSize?: number | null
  fileName?: string | null
  status?: MessageStatus | null
  metadata?: Record<string, unknown> | null
  createdAt!: string
  updatedAt!: string
}

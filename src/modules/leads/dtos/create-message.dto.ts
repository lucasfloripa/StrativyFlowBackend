import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import {
  MessageDirection,
  MessageStatus,
  MessageType
} from '../entities/message.entity'

export class CreateMessageDto {
  @IsString()
  leadId!: string

  @IsEnum(MessageDirection)
  direction!: MessageDirection

  @IsOptional()
  @IsString()
  content?: string | null

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType

  @IsOptional()
  @IsString()
  whatsappMessageId?: string | null

  @IsOptional()
  @IsString()
  metaMediaId?: string | null

  @IsOptional()
  @IsString()
  mediaUrl?: string | null

  @IsOptional()
  @IsString()
  mimeType?: string | null

  @IsOptional()
  @IsNumber()
  mediaSize?: number | null

  @IsOptional()
  @IsString()
  mediaSha256?: string | null

  @IsOptional()
  @IsString()
  fileName?: string | null

  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus | null

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null
}

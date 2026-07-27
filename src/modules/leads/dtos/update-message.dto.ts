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
  MessageType,
  MessageSource
} from '../entities/message.entity'

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  leadId?: string

  @IsOptional()
  @IsEnum(MessageDirection)
  direction?: MessageDirection

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
  @IsEnum(MessageSource)
  source?: MessageSource

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null
}

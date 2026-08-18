import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator'

import { LeadChannel } from '../entities/lead-channel-identity.entity'
import { MessageSource } from '../entities/message.entity'
import { OUTBOUND_MEDIA_TYPES } from '../services/types/outbound-media.type'

import type { OutboundMediaType } from '../services/types/outbound-media.type'

export class SendMediaLeadMessageDto {
  @IsString()
  @IsIn([...OUTBOUND_MEDIA_TYPES])
  type!: OutboundMediaType

  @IsOptional()
  @IsString()
  caption?: string

  @IsOptional()
  @IsEnum(MessageSource)
  source?: MessageSource

  @IsOptional()
  metadata?: unknown

  @IsOptional()
  @IsEnum(LeadChannel)
  channel?: LeadChannel
}

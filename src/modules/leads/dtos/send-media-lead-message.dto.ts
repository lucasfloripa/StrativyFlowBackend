import { IsIn, IsOptional, IsString } from 'class-validator'

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
  metadata?: unknown
}

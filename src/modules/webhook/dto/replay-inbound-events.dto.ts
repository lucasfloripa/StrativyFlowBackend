import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator'

import { MAX_REPLAY_BATCH } from '../inbound/inbound-event-inbox.service'

/** Which `failed` inbound events to put back on the worker queue. */
export class ReplayInboundEventsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REPLAY_BATCH)
  @IsUUID('all', { each: true })
  ids?: string[]

  /** `channel:account:user`, e.g. `whatsapp:<phone_number_id>:<wa_id>`. */
  @IsOptional()
  @IsString()
  conversationKey?: string

  /** ISO 8601, inclusive. */
  @IsOptional()
  @IsISO8601()
  receivedFrom?: string

  /** ISO 8601, exclusive. */
  @IsOptional()
  @IsISO8601()
  receivedTo?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REPLAY_BATCH)
  limit?: number
}

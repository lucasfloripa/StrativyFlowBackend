import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'

import { LeadChannel } from '../entities/lead-channel-identity.entity'
import { MessageSource } from '../entities/message.entity'

export class SendTextLeadMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string

  @IsOptional()
  @IsEnum(MessageSource)
  source?: MessageSource

  @IsOptional()
  @IsEnum(LeadChannel)
  channel?: LeadChannel
}

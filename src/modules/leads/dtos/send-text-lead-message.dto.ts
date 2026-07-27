import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { MessageSource } from '../entities/message.entity'

export class SendTextLeadMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string

  @IsOptional()
  @IsEnum(MessageSource)
  source?: MessageSource
}

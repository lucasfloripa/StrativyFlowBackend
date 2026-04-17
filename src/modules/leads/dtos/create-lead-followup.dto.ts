import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator'

export class CreateLeadFollowUpDto {
  @IsUUID()
  leadId: string

  @IsString()
  @IsNotEmpty()
  value: string

  @IsDateString()
  dueAt: string
}

import { IsNotEmpty, IsString } from 'class-validator'

export class SendTextLeadMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string
}

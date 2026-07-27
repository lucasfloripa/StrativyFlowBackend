import { IsNotEmpty, IsObject, IsString } from 'class-validator'

export class SendTemplateLeadMessageDto {
  @IsString()
  @IsNotEmpty()
  templateId!: string

  @IsObject()
  @IsNotEmpty()
  variables!: Record<string, string>
}

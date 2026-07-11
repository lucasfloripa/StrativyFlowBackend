import { IsNotEmpty, IsString } from 'class-validator'

export class SendLeadMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string
}

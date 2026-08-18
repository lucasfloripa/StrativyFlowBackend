import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator'

export class SendContactLeadMessageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  contactIds!: string[]
}

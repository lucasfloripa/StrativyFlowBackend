import { IsNotEmpty, IsUUID } from 'class-validator'

export class JoinLeadRoomDto {
  @IsUUID()
  @IsNotEmpty()
  leadId!: string
}

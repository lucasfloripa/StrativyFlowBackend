import { IsNotEmpty, IsString } from 'class-validator'

export class JoinLeadRoomDto {
  @IsString()
  @IsNotEmpty()
  leadId!: string
}

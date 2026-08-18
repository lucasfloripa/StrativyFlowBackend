import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'

import { LeadChannel } from '../entities/lead-channel-identity.entity'

export class CreateLeadChannelIdentityDto {
  @IsEnum(LeadChannel)
  channel!: LeadChannel

  @IsString()
  @IsNotEmpty()
  externalAccountId!: string

  @IsString()
  @IsNotEmpty()
  externalUserId!: string

  @IsOptional()
  @IsString()
  profileName?: string

  @IsOptional()
  @IsString()
  profilePictureUrl?: string
}

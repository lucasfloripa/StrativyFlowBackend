import {
  IsDateString,
  IsEnum,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import {
  LeadQualification,
  LeadRuntimeMode,
  LeadSocialLinks,
  LeadState
} from '../entities/lead.entity'

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  phone!: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  lastInboundMessageId?: string // <-- adicionado para idempotência de mensagens do WhatsApp

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  metaAdId?: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsObject()
  socialLinks?: Partial<Record<LeadSocialLinks, string>> | null

  @IsOptional()
  @IsEnum(LeadQualification)
  leadQualification?: LeadQualification | null

  @IsOptional()
  @IsString()
  value?: string

  @IsOptional()
  @IsDateString()
  closedAt?: string

  @IsOptional()
  @IsEnum(LeadState)
  state?: LeadState

  @IsOptional()
  @IsEnum(LeadRuntimeMode)
  runtimeMode?: LeadRuntimeMode
}

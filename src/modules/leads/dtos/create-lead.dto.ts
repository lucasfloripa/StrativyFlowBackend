import {
  IsDateString,
  IsEnum,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  Matches,
  IsString
} from 'class-validator'

import {
  LeadQualification,
  LeadRuntimeMode,
  LeadSocialLinks,
  LeadState
} from '../entities/lead.entity'

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^55\d{10,11}$/)
  phone!: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  lastInboundMessageId?: string // <-- adicionado para idempotência de mensagens do WhatsApp

  @IsOptional()
  @IsString()
  @Matches(/^(?!\s*(?:messenger|direct)\s*$).+$/i)
  source?: string

  @IsOptional()
  @IsString()
  metaAdId?: string

  @IsOptional()
  @IsString()
  googleAdId?: string

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

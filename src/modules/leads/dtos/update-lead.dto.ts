import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import {
  LeadQualification,
  LeadSocialLinks,
  LeadState
} from '../entities/lead.entity'

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  source?: string

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
}

import {
  IsDateString,
  IsEmail,
  IsEmpty,
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
  @IsEmpty({ message: 'companyId cannot be changed through lead updates' })
  companyId?: never

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
}

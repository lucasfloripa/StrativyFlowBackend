import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString
} from 'class-validator'

import { LeadQualification, LeadState } from '../entities/lead.entity'

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

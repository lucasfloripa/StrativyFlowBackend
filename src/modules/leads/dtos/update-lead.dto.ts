import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator'

import {
  LeadOutcome,
  LeadState,
  LeadTemperature
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
  companyName?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  initialContext?: string

  @IsOptional()
  @IsEnum(LeadTemperature)
  temperature?: LeadTemperature

  @IsOptional()
  @IsEnum(LeadOutcome)
  outcome?: LeadOutcome

  @IsOptional()
  @IsEnum(LeadState)
  state?: LeadState
}

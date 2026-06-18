import {
  IsEnum,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator'

import {
  LeadOutcome,
  LeadRuntimeMode,
  LeadState,
  LeadTemperature
} from '../entities/lead.entity'

export class CreateLeadDto {
  @IsUUID()
  @IsNotEmpty()
  boardId: string

  // opcional: se não vier, cai na 1ª coluna do board
  @IsOptional()
  @IsUUID()
  columnId?: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  phone: string

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

  @IsOptional()
  @IsEnum(LeadRuntimeMode)
  runtimeMode?: LeadRuntimeMode
}

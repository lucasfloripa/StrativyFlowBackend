import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  IsUUID
} from 'class-validator'

import {
  NegotiationType,
  NegotiationStage,
  NegotiationTemperature
} from '../entities/negotiation.entity'

import { NegotiationNoteDto } from './negotiation-note.dto'

export class CreateNegotiationDto {
  @IsUUID()
  leadId!: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsEnum(NegotiationStage)
  stage?: NegotiationStage

  @IsOptional()
  @IsEnum(NegotiationTemperature)
  temperature?: NegotiationTemperature

  @IsOptional()
  @IsEnum(NegotiationType)
  negotiationType?: NegotiationType

  @IsOptional()
  @IsString()
  value?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NegotiationNoteDto)
  notes?: NegotiationNoteDto[]

  @IsOptional()
  @IsDateString()
  closedAt?: string

  @IsOptional()
  @IsDateString()
  stageUpdatedAt?: string
}

import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator'

import { FollowUpStatus } from '../entities/followup.entity'

export class UpdateFollowUpDto {
  @IsOptional()
  @IsUUID()
  negotiationId?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsUUID()
  templateId?: string

  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, unknown>

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus

  @IsOptional()
  @IsDateString()
  completedAt?: string
}

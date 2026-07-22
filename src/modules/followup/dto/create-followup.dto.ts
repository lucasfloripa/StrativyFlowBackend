import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator'

import { FollowUpStatus } from '../entities/followup.entity'

export class CreateFollowUpDto {
  @IsUUID()
  negotiationId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsUUID()
  templateId?: string

  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, unknown>

  @IsDateString()
  dueAt!: string

  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus

  @IsOptional()
  @IsDateString()
  completedAt?: string
}

import {
  IsDateString,
  IsEnum,
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
  value?: string

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

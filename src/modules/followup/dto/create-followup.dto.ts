import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
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
  value!: string

  @IsDateString()
  dueAt!: string

  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus

  @IsOptional()
  @IsDateString()
  completedAt?: string
}

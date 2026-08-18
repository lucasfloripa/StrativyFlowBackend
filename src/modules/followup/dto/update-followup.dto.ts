import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from 'class-validator'

import { FollowUpStatus } from '../entities/followup.entity'

import { CreateFollowUpActionDto } from './create-followup-action.dto'

export class UpdateFollowUpDto {
  @IsOptional()
  @IsUUID()
  negotiationId?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFollowUpActionDto)
  actions?: CreateFollowUpActionDto[]

  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus

  @IsOptional()
  @IsDateString()
  completedAt?: string
}

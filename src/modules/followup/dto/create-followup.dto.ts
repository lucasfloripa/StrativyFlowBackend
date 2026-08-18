import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from 'class-validator'

import { FollowUpStatus } from '../entities/followup.entity'

import { CreateFollowUpActionDto } from './create-followup-action.dto'

export class CreateFollowUpDto {
  @IsUUID()
  negotiationId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsDateString()
  dueAt!: string

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

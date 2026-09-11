import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested
} from 'class-validator'

import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStepChannel,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'

export class CreateFollowUpStepTreeItemDto {
  @IsUUID()
  clientId!: string

  @IsOptional()
  @IsUUID()
  parentClientId?: string | null

  @IsIn([FollowUpStepType.ACTION, FollowUpStepType.CONDITION])
  type!: FollowUpStepType

  @IsOptional()
  @IsEnum(FollowUpActionType)
  actionType?: FollowUpActionType | null

  @IsOptional()
  @IsEnum(FollowUpConditionType)
  conditionType?: FollowUpConditionType | null

  @IsOptional()
  @IsEnum(FollowUpStepChannel)
  channel?: FollowUpStepChannel | null

  @IsOptional()
  @IsInt()
  @Min(0)
  waitTime?: number | null

  @IsOptional()
  @IsEnum(FollowUpWaitUnit)
  waitUnit?: FollowUpWaitUnit | null

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown> | null
}

export class CreateFollowUpStepTreeDto {
  @IsUUID()
  followUpId!: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFollowUpStepTreeItemDto)
  steps!: CreateFollowUpStepTreeItemDto[]
}

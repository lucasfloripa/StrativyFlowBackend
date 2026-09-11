import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min
} from 'class-validator'

import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStepChannel,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'

export class FollowUpStepConfigurationDto {
  @IsOptional()
  @IsUUID()
  parentId?: string | null

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

export class UpdateNestedFollowUpStepDto extends FollowUpStepConfigurationDto {}

export class CreateNestedFollowUpStepDto extends FollowUpStepConfigurationDto {}

export class CreateFollowUpStepDto extends FollowUpStepConfigurationDto {
  @IsUUID()
  followUpId!: string
}

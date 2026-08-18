import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf
} from 'class-validator'

import {
  FollowUpActionChannel,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'

export class CreateFollowUpActionDto {
  @IsEnum(FollowUpActionType)
  type!: FollowUpActionType

  @ValidateIf(
    (action: CreateFollowUpActionDto) =>
      action.type === FollowUpActionType.SEND_MESSAGE ||
      action.channel !== undefined
  )
  @IsEnum(FollowUpActionChannel)
  channel?: FollowUpActionChannel

  @IsOptional()
  @IsEnum(FollowUpActionStatus)
  status?: FollowUpActionStatus

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsDateString()
  executedAt?: string

  @IsOptional()
  @IsString()
  failureReason?: string
}

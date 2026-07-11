import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import { type AutomationRuleConditions } from '../entities/automation-rule.entity'
import { AutomationAction } from '../flow/automation-action.types'
import { AutomationTriggerType } from '../flow/automation-trigger.types'

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsEnum(AutomationTriggerType)
  triggerType!: AutomationTriggerType

  @IsOptional()
  @IsObject()
  conditions?: AutomationRuleConditions

  @IsArray()
  @ArrayMinSize(1)
  actions!: AutomationAction[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

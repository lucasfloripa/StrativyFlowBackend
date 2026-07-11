import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import { type AutomationRuleConditions } from '../entities/automation-rule.entity'
import { AutomationAction } from '../flow/automation-action.types'
import { AutomationTriggerType } from '../flow/automation-trigger.types'

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEnum(AutomationTriggerType)
  triggerType?: AutomationTriggerType

  @IsOptional()
  @IsObject()
  conditions?: AutomationRuleConditions

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  actions?: AutomationAction[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

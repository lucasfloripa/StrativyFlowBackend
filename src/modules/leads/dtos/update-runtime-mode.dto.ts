import { IsEnum } from 'class-validator'

import { LeadRuntimeMode } from '../entities/lead.entity'

export class UpdateRuntimeModeDto {
  @IsEnum(LeadRuntimeMode)
  runtimeMode: LeadRuntimeMode
}

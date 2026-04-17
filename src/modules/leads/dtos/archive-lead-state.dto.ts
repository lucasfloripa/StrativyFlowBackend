import { IsEnum } from 'class-validator'

import { LeadState } from '../entities/lead.entity'

export class ArchiveLeadStateDto {
  @IsEnum(LeadState)
  state: LeadState
}

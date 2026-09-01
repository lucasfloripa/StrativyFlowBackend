import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches
} from 'class-validator'

import { NegotiationCostType } from '../entities/negotiation-cost.entity'

const decimalAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/

export class UpdateNegotiationCostDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string

  @IsOptional()
  @IsEnum(NegotiationCostType)
  type?: NegotiationCostType

  @IsOptional()
  @Matches(decimalAmountPattern)
  amount?: string
}

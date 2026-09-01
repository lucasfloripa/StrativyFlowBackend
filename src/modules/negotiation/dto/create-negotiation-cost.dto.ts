import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator'

import { NegotiationCostType } from '../entities/negotiation-cost.entity'

const decimalAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/

export class CreateNegotiationCostDto {
  @IsString()
  @IsNotEmpty()
  description!: string

  @IsEnum(NegotiationCostType)
  type!: NegotiationCostType

  @Matches(decimalAmountPattern)
  amount!: string
}

import { IsOptional, Matches } from 'class-validator'

const decimalAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/

export class UpdateNegotiationFinancialDto {
  @IsOptional()
  @Matches(decimalAmountPattern)
  saleAmount?: string

  @IsOptional()
  @Matches(decimalAmountPattern)
  discountAmount?: string | null
}

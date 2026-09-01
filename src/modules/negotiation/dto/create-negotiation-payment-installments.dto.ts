import { IsDateString, IsEnum, IsInt, Matches, Min } from 'class-validator'

import { NegotiationPaymentMethod } from '../entities/negotiation-payment.entity'

const decimalAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/

export class CreateNegotiationPaymentInstallmentsDto {
  @Matches(decimalAmountPattern)
  amount!: string

  @IsEnum(NegotiationPaymentMethod)
  paymentMethod!: NegotiationPaymentMethod

  @IsDateString()
  dueDate!: string

  @IsInt()
  @Min(1)
  installmentCount!: number
}

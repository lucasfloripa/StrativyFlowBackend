import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches
} from 'class-validator'

import {
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

const decimalAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/

export class CreateNegotiationPaymentDto {
  @Matches(decimalAmountPattern)
  amount!: string

  @IsEnum(NegotiationPaymentMethod)
  paymentMethod!: NegotiationPaymentMethod

  @IsDateString()
  dueDate!: string

  @IsOptional()
  @IsDateString()
  paidAt?: string | null

  @IsEnum(NegotiationPaymentStatus)
  status!: NegotiationPaymentStatus

  @IsOptional()
  @IsUUID()
  proofAttachmentId?: string | null
}

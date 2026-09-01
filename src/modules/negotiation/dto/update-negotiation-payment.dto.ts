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

export class UpdateNegotiationPaymentDto {
  @IsOptional()
  @Matches(decimalAmountPattern)
  amount?: string

  @IsOptional()
  @IsEnum(NegotiationPaymentMethod)
  paymentMethod?: NegotiationPaymentMethod

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsDateString()
  paidAt?: string | null

  @IsOptional()
  @IsEnum(NegotiationPaymentStatus)
  status?: NegotiationPaymentStatus

  @IsOptional()
  @IsUUID()
  proofAttachmentId?: string | null
}

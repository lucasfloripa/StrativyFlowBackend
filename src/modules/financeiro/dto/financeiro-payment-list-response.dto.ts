import {
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../../negotiation/entities/negotiation-payment.entity'

export class FinanceiroPaymentListItemDto {
  id!: string
  leadId!: string
  leadName!: string
  negotiationId!: string
  negotiationTitle!: string
  paymentMethod!: NegotiationPaymentMethod
  installmentNumber!: number
  totalInstallments!: number
  dueDate!: Date
  amount!: number
  status!: NegotiationPaymentStatus
}

export class FinanceiroPaymentListResponseDto {
  items!: FinanceiroPaymentListItemDto[]
}

import { NegotiationStage } from '../../negotiation/entities/negotiation.entity'

export type FinanceiroDistributionKpisResponseDto = {
  temperatura: {
    hot: number
    warm: number
    cold: number
    none: number
  }
  status: {
    open: number
    won: number
    lost: number
  }
  origem: {
    whatsapp: number
    metaads: number
    googleads: number
    indicacao: number
    other: number
  }
  etapas: Array<{
    stage: NegotiationStage
    count: number
    totalValue: number
  }>
}

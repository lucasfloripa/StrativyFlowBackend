export type FinanceiroTemplateCostType = 'MARKETING' | 'UTILITY' | 'UNKNOWN'

export class FinanceiroTemplateCostItemDto {
  type!: FinanceiroTemplateCostType
  label!: string
  quantity!: number
  unitCost!: number
  totalCost!: number
}

export class FinanceiroTemplateCostsResponseDto {
  totalTemplates!: number
  totalCost!: number
  types!: FinanceiroTemplateCostItemDto[]
}

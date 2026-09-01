import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

import {
  Message,
  MessageDirection,
  MessageSource
} from '../leads/entities/message.entity'
import { NegotiationCost } from '../negotiation/entities/negotiation-cost.entity'
import { NegotiationFinancial } from '../negotiation/entities/negotiation-financial.entity'
import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../negotiation/entities/negotiation-payment.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroBusinessSummaryResponseDto } from './dto/financeiro-business-summary-response.dto'
import { FinanceiroPaymentsResponseDto } from './dto/financeiro-payments-response.dto'
import { FinanceiroRevenueResponseDto } from './dto/financeiro-revenue-response.dto'
import {
  FinanceiroTemplateCostsResponseDto,
  FinanceiroTemplateCostType
} from './dto/financeiro-template-costs-response.dto'
import { FinanceiroTopKpisQueryDto } from './dto/financeiro-top-kpis-query.dto'

const TEMPLATE_COSTS_IN_CENTS: Record<FinanceiroTemplateCostType, number> = {
  MARKETING: 30,
  UTILITY: 4,
  UNKNOWN: 0
}

const TEMPLATE_TYPE_LABELS: Record<FinanceiroTemplateCostType, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilitário',
  UNKNOWN: 'Não identificado'
}

@Injectable()
export class FinanceiroService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(NegotiationFinancial)
    private readonly negotiationFinancialRepository: Repository<NegotiationFinancial>,
    @InjectRepository(NegotiationCost)
    private readonly negotiationCostRepository: Repository<NegotiationCost>,
    @InjectRepository(NegotiationPayment)
    private readonly negotiationPaymentRepository: Repository<NegotiationPayment>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>
  ) {}

  async getBusinessSummary(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroBusinessSummaryResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    const revenue = await this.loadRevenue(userInformationsIds, query)
    const totalCosts = await this.loadTotalCosts(userInformationsIds, query)
    const netResult = revenue.netRevenue - totalCosts

    return {
      netRevenue: revenue.netRevenue,
      totalCosts,
      netResult,
      profitMargin:
        revenue.netRevenue > 0 ? (netResult / revenue.netRevenue) * 100 : 0
    }
  }

  async getRevenue(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroRevenueResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    return await this.loadRevenue(userInformationsIds, query)
  }

  async getPayments(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroPaymentsResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    if (!userInformationsIds.length) {
      return this.emptyPayments()
    }

    const queryBuilder = this.negotiationPaymentRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.negotiationFinancial', 'financial')
      .innerJoin('financial.negotiation', 'negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .select(
        `COALESCE(SUM(CASE WHEN payment.status = :paidStatus THEN payment.amount ELSE 0 END), 0)`,
        'receivedAmount'
      )
      .addSelect(
        `COUNT(CASE WHEN payment.status = :paidStatus THEN 1 END)`,
        'receivedCount'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN payment.status = :pendingStatus THEN payment.amount ELSE 0 END), 0)`,
        'pendingAmount'
      )
      .addSelect(
        `COUNT(CASE WHEN payment.status = :pendingStatus THEN 1 END)`,
        'pendingCount'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN payment.status = :overdueStatus THEN payment.amount ELSE 0 END), 0)`,
        'overdueAmount'
      )
      .addSelect(
        `COUNT(CASE WHEN payment.status = :overdueStatus THEN 1 END)`,
        'overdueCount'
      )
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })
      .setParameters({
        paidStatus: NegotiationPaymentStatus.PAID,
        pendingStatus: NegotiationPaymentStatus.PENDING,
        overdueStatus: NegotiationPaymentStatus.OVERDUE
      })

    this.applyCreatedAtFilter(queryBuilder, 'negotiation', query)

    const rawPayments = await queryBuilder.getRawOne<{
      receivedAmount: string
      receivedCount: string
      pendingAmount: string
      pendingCount: string
      overdueAmount: string
      overdueCount: string
    }>()

    return {
      receivedAmount: Number(rawPayments?.receivedAmount ?? 0),
      receivedCount: Number(rawPayments?.receivedCount ?? 0),
      pendingAmount: Number(rawPayments?.pendingAmount ?? 0),
      pendingCount: Number(rawPayments?.pendingCount ?? 0),
      overdueAmount: Number(rawPayments?.overdueAmount ?? 0),
      overdueCount: Number(rawPayments?.overdueCount ?? 0)
    }
  }

  async getTemplateCosts(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroTemplateCostsResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    const quantities = new Map<FinanceiroTemplateCostType, number>()

    if (userInformationsIds.length) {
      const queryBuilder = this.messageRepository
        .createQueryBuilder('message')
        .innerJoin('leads', 'lead', 'lead.id::text = message."leadId"')
        .select(
          `CASE WHEN UPPER(TRIM(message."templateType")) IN ('MARKETING', 'UTILITY') THEN UPPER(TRIM(message."templateType")) ELSE 'UNKNOWN' END`,
          'templateType'
        )
        .addSelect('COUNT(*)', 'quantity')
        .where('lead."userInformationsId" IN (:...userInformationsIds)', {
          userInformationsIds
        })
        .andWhere('message.direction = :direction', {
          direction: MessageDirection.OUTBOUND
        })
        .andWhere('message.source = :source', {
          source: MessageSource.TEMPLATE
        })
        .groupBy('"templateType"')

      this.applyCreatedAtFilter(queryBuilder, 'message', query)

      const rawCosts = await queryBuilder.getRawMany<{
        templateType: FinanceiroTemplateCostType
        quantity: string
      }>()

      for (const item of rawCosts) {
        quantities.set(item.templateType, Number(item.quantity))
      }
    }

    const types = (
      ['MARKETING', 'UTILITY', 'UNKNOWN'] as FinanceiroTemplateCostType[]
    ).map((type) => {
      const quantity = quantities.get(type) ?? 0
      const unitCostInCents = TEMPLATE_COSTS_IN_CENTS[type]

      return {
        type,
        label: TEMPLATE_TYPE_LABELS[type],
        quantity,
        unitCost: unitCostInCents / 100,
        totalCost: (quantity * unitCostInCents) / 100
      }
    })

    return {
      totalTemplates: types.reduce((total, item) => total + item.quantity, 0),
      totalCost: types.reduce((total, item) => total + item.totalCost, 0),
      types
    }
  }

  private async findUserInformationsIds(userId: string): Promise<string[]> {
    const userInformations = await this.userInformationsRepository.find({
      where: { userId },
      select: ['id']
    })

    return userInformations.map((item) => item.id)
  }

  private async loadRevenue(
    userInformationsIds: string[],
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroRevenueResponseDto> {
    if (!userInformationsIds.length) {
      return { grossRevenue: 0, totalDiscounts: 0, netRevenue: 0 }
    }

    const queryBuilder = this.negotiationFinancialRepository
      .createQueryBuilder('financial')
      .innerJoin('financial.negotiation', 'negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .select('COALESCE(SUM(financial."saleAmount"), 0)', 'grossRevenue')
      .addSelect(
        'COALESCE(SUM(financial."discountAmount"), 0)',
        'totalDiscounts'
      )
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })

    this.applyCreatedAtFilter(queryBuilder, 'negotiation', query)

    const rawRevenue = await queryBuilder.getRawOne<{
      grossRevenue: string
      totalDiscounts: string
    }>()
    const grossRevenue = Number(rawRevenue?.grossRevenue ?? 0)
    const totalDiscounts = Number(rawRevenue?.totalDiscounts ?? 0)

    return {
      grossRevenue,
      totalDiscounts,
      netRevenue: grossRevenue - totalDiscounts
    }
  }

  private async loadTotalCosts(
    userInformationsIds: string[],
    query: FinanceiroTopKpisQueryDto
  ): Promise<number> {
    if (!userInformationsIds.length) {
      return 0
    }

    const queryBuilder = this.negotiationCostRepository
      .createQueryBuilder('cost')
      .innerJoin('cost.negotiationFinancial', 'financial')
      .innerJoin('financial.negotiation', 'negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .select('COALESCE(SUM(cost.amount), 0)', 'totalCosts')
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })

    this.applyCreatedAtFilter(queryBuilder, 'negotiation', query)

    const rawCosts = await queryBuilder.getRawOne<{ totalCosts: string }>()

    return Number(rawCosts?.totalCosts ?? 0)
  }

  private emptyPayments(): FinanceiroPaymentsResponseDto {
    return {
      receivedAmount: 0,
      receivedCount: 0,
      pendingAmount: 0,
      pendingCount: 0,
      overdueAmount: 0,
      overdueCount: 0
    }
  }

  private parseDateOnly(value?: string): Date | null {
    if (!value) {
      return null
    }

    const trimmedValue = value.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return null
    }

    const parsedDate = new Date(`${trimmedValue}T00:00:00`)
    if (Number.isNaN(parsedDate.getTime())) {
      return null
    }

    return parsedDate
  }

  private applyCreatedAtFilter<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    alias: string,
    query: FinanceiroTopKpisQueryDto
  ): void {
    const createdAtFrom = this.parseDateOnly(query.createdAtFrom)
    const createdAtTo = this.parseDateOnly(query.createdAtTo)

    if (createdAtFrom) {
      queryBuilder.andWhere(`${alias}."createdAt" >= :createdAtFrom`, {
        createdAtFrom
      })
    }

    if (createdAtTo) {
      const createdAtToExclusive = new Date(createdAtTo)
      createdAtToExclusive.setDate(createdAtToExclusive.getDate() + 1)

      queryBuilder.andWhere(`${alias}."createdAt" < :createdAtToExclusive`, {
        createdAtToExclusive
      })
    }
  }
}

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

import {
  Message,
  MessageDirection,
  MessageSource
} from '../leads/entities/message.entity'
import {
  Negotiation,
  NegotiationStage
} from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroDistributionKpisResponseDto } from './dto/financeiro-distribution-kpis-response.dto'
import {
  FinanceiroTemplateCostsResponseDto,
  FinanceiroTemplateCostType
} from './dto/financeiro-template-costs-response.dto'
import { FinanceiroTopKpisQueryDto } from './dto/financeiro-top-kpis-query.dto'
import { FinanceiroTopSummaryResponseDto } from './dto/financeiro-top-summary-response.dto'

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
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>
  ) {}

  async getTopKpis(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroTopSummaryResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return {
        receitaPrevista: 0,
        receitaFaturada: 0,
        receitaPerdida: 0,
        ticketMedio: 0,
        taxaConversao: 0,
        negociosEmAberto: 0
      }
    }

    const queryBuilder = this.createScopedNegotiationsQuery(
      userInformationsIds,
      query
    )

    const rawSummary = await queryBuilder
      .select(
        `COALESCE(SUM(CASE WHEN negotiation.stage NOT IN ('WON', 'LOST') THEN COALESCE(negotiation.value::numeric, 0) ELSE 0 END), 0)`,
        'receitaPrevista'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN negotiation.stage = :wonStage THEN COALESCE(negotiation.value::numeric, 0) ELSE 0 END), 0)`,
        'receitaFaturada'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN negotiation.stage = :lostStage THEN COALESCE(negotiation.value::numeric, 0) ELSE 0 END), 0)`,
        'receitaPerdida'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN negotiation.stage NOT IN ('WON', 'LOST') THEN 1 ELSE 0 END), 0)`,
        'negociosEmAberto'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN negotiation.stage = :wonStage THEN 1 ELSE 0 END), 0)`,
        'negociosGanhos'
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN negotiation.stage = :lostStage THEN 1 ELSE 0 END), 0)`,
        'negociosPerdidos'
      )
      .setParameters({
        wonStage: NegotiationStage.WON,
        lostStage: NegotiationStage.LOST
      })
      .getRawOne<{
        receitaPrevista: string
        receitaFaturada: string
        receitaPerdida: string
        negociosEmAberto: string
        negociosGanhos: string
        negociosPerdidos: string
      }>()

    const receitaPrevista = Number(rawSummary?.receitaPrevista ?? 0)
    const receitaFaturada = Number(rawSummary?.receitaFaturada ?? 0)
    const receitaPerdida = Number(rawSummary?.receitaPerdida ?? 0)
    const negociosEmAberto = Number(rawSummary?.negociosEmAberto ?? 0)
    const negociosGanhos = Number(rawSummary?.negociosGanhos ?? 0)
    const negociosPerdidos = Number(rawSummary?.negociosPerdidos ?? 0)

    const ticketMedio =
      negociosGanhos > 0 ? receitaFaturada / negociosGanhos : 0
    const totalEncerrados = negociosGanhos + negociosPerdidos
    const taxaConversao =
      totalEncerrados > 0 ? (negociosGanhos / totalEncerrados) * 100 : 0

    return {
      receitaPrevista,
      receitaFaturada,
      receitaPerdida,
      ticketMedio,
      taxaConversao,
      negociosEmAberto
    }
  }

  async getDistributionKpis(
    userId: string,
    query: FinanceiroTopKpisQueryDto
  ): Promise<FinanceiroDistributionKpisResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return {
        temperatura: {
          hot: 0,
          warm: 0,
          cold: 0,
          none: 0
        },
        status: {
          open: 0,
          won: 0,
          lost: 0
        },
        origem: {
          whatsapp: 0,
          metaads: 0,
          googleads: 0,
          indicacao: 0,
          other: 0
        },
        etapas: this.getStageOrder().map((stage) => ({
          stage,
          count: 0,
          totalValue: 0
        }))
      }
    }

    const [temperatureRaw, statusRaw, sourceRaw, stageRaw] = await Promise.all([
      this.createScopedNegotiationsQuery(userInformationsIds, query)
        .select(
          `CASE WHEN negotiation.temperature IS NULL THEN 'none' ELSE negotiation.temperature::text END`,
          'temperature'
        )
        .addSelect('COUNT(*)', 'count')
        .groupBy('temperature')
        .getRawMany<{
          temperature: 'hot' | 'warm' | 'cold' | 'none'
          count: string
        }>(),
      this.createScopedNegotiationsQuery(userInformationsIds, query)
        .select(
          `CASE WHEN negotiation.stage = 'WON' THEN 'won' WHEN negotiation.stage = 'LOST' THEN 'lost' ELSE 'open' END`,
          'status'
        )
        .addSelect('COUNT(*)', 'count')
        .groupBy('status')
        .getRawMany<{ status: 'open' | 'won' | 'lost'; count: string }>(),
      this.createScopedNegotiationsQuery(userInformationsIds, query)
        .select('lead.source', 'source')
        .addSelect('COUNT(*)', 'count')
        .groupBy('lead.source')
        .getRawMany<{ source: string | null; count: string }>(),
      this.createScopedNegotiationsQuery(userInformationsIds, query)
        .select('negotiation.stage', 'stage')
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          'COALESCE(SUM(COALESCE(negotiation.value::numeric, 0)), 0)',
          'totalValue'
        )
        .groupBy('negotiation.stage')
        .getRawMany<{
          stage: NegotiationStage
          count: string
          totalValue: string
        }>()
    ])

    const temperatura: FinanceiroDistributionKpisResponseDto['temperatura'] = {
      hot: 0,
      warm: 0,
      cold: 0,
      none: 0
    }

    for (const item of temperatureRaw) {
      const key = item.temperature
      if (key === 'hot' || key === 'warm' || key === 'cold' || key === 'none') {
        temperatura[key] = Number(item.count)
      }
    }

    const status: FinanceiroDistributionKpisResponseDto['status'] = {
      open: 0,
      won: 0,
      lost: 0
    }

    for (const item of statusRaw) {
      const key = item.status
      if (key === 'open' || key === 'won' || key === 'lost') {
        status[key] = Number(item.count)
      }
    }

    const origem: FinanceiroDistributionKpisResponseDto['origem'] = {
      whatsapp: 0,
      metaads: 0,
      googleads: 0,
      indicacao: 0,
      other: 0
    }

    for (const item of sourceRaw) {
      const normalizedSource = this.normalizeSourceKey(item.source)
      origem[normalizedSource] += Number(item.count)
    }

    const stageMap = new Map<
      NegotiationStage,
      {
        count: number
        totalValue: number
      }
    >()

    for (const item of stageRaw) {
      if (!item.stage) {
        continue
      }

      stageMap.set(item.stage, {
        count: Number(item.count),
        totalValue: Number(item.totalValue)
      })
    }

    const etapas = this.getStageOrder().map((stage) => {
      const stageValue = stageMap.get(stage)

      return {
        stage,
        count: stageValue?.count ?? 0,
        totalValue: stageValue?.totalValue ?? 0
      }
    })

    return {
      temperatura,
      status,
      origem,
      etapas
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

  private createScopedNegotiationsQuery(
    userInformationsIds: string[],
    query: FinanceiroTopKpisQueryDto
  ): SelectQueryBuilder<Negotiation> {
    const createdAtFrom = this.parseDateOnly(query.createdAtFrom)
    const createdAtTo = this.parseDateOnly(query.createdAtTo)

    const queryBuilder = this.negotiationRepository
      .createQueryBuilder('negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })

    if (createdAtFrom) {
      queryBuilder.andWhere('negotiation."createdAt" >= :createdAtFrom', {
        createdAtFrom
      })
    }

    if (createdAtTo) {
      const createdAtToExclusive = new Date(createdAtTo)
      createdAtToExclusive.setDate(createdAtToExclusive.getDate() + 1)

      queryBuilder.andWhere('negotiation."createdAt" < :createdAtToExclusive', {
        createdAtToExclusive
      })
    }

    return queryBuilder
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

  private normalizeSourceKey(
    source: string | null
  ): 'whatsapp' | 'metaads' | 'googleads' | 'indicacao' | 'other' {
    const normalizedSource = (source ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]+/g, '')

    if (normalizedSource === 'whatsapp') return 'whatsapp'
    if (normalizedSource === 'metaads') return 'metaads'
    if (normalizedSource === 'googleads') return 'googleads'
    if (normalizedSource === 'indicacao') return 'indicacao'

    return 'other'
  }

  private getStageOrder(): NegotiationStage[] {
    return [
      NegotiationStage.NEW,
      NegotiationStage.CONTACTED,
      NegotiationStage.QUALIFIED,
      NegotiationStage.PROPOSAL_SENT,
      NegotiationStage.NEGOTIATION,
      NegotiationStage.WON,
      NegotiationStage.LOST
    ]
  }
}

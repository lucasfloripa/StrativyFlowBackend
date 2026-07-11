import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import { Lead, LeadState } from '../leads/entities/lead.entity'
import {
  Negotiation,
  NegotiationStage
} from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

type DashboardSummary = {
  activeLeads: number
  newToday: number
  withoutConversation24h: number
  followUps: {
    overdue: number
    today: number
    scheduled: number
  }
  revenue: number
}

type DateBoundary = 'start' | 'end'

type DashboardIncomeResponse = {
  income: number
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Negotiation)
    private readonly negotiationRepo: Repository<Negotiation>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async getSummary(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<DashboardSummary> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return {
        activeLeads: 0,
        newToday: 0,
        withoutConversation24h: 0,
        followUps: {
          overdue: 0,
          today: 0,
          scheduled: 0
        },
        revenue: 0
      }
    }

    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const defaultRevenueStart = new Date(now)
    defaultRevenueStart.setMonth(defaultRevenueStart.getMonth() - 1)

    const revenueStartAt = startDate ? new Date(startDate) : defaultRevenueStart
    const revenueEndAt = endDate ? new Date(endDate) : now

    if (
      Number.isNaN(revenueStartAt.getTime()) ||
      Number.isNaN(revenueEndAt.getTime())
    ) {
      throw new BadRequestException('Invalid revenue date range')
    }

    if (revenueStartAt > revenueEndAt) {
      throw new BadRequestException('startDate must be before endDate')
    }

    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const [
      activeLeads,
      newToday,
      withoutConversation24h,
      followUpsRaw,
      revenueRaw
    ] = await Promise.all([
      this.leadRepo.count({
        where: {
          userInformationsId: In(userInformationsIds),
          state: LeadState.ACTIVE
        }
      }),
      this.leadRepo.count({
        where: {
          userInformationsId: In(userInformationsIds),
          state: LeadState.ACTIVE,
          createdAt: MoreThanOrEqual(twentyFourHoursAgo)
        }
      }),
      this.leadRepo
        .createQueryBuilder('lead')
        .where('lead."userInformationsId" IN (:...userInformationsIds)', {
          userInformationsIds
        })
        .andWhere('lead.state = :activeState', {
          activeState: LeadState.ACTIVE
        })
        .andWhere(
          `EXISTS (
            SELECT 1
            FROM messages message
            WHERE message."leadId" = lead.id::text
          )`
        )
        .andWhere(
          `NOT EXISTS (
            SELECT 1
            FROM messages message
            WHERE message."leadId" = lead.id::text
              AND message."createdAt" >= :twentyFourHoursAgo
          )`,
          { twentyFourHoursAgo }
        )
        .getCount(),
      this.followUpRepo
        .createQueryBuilder('followup')
        .innerJoin('followup.negotiation', 'negotiation')
        .innerJoin('negotiation.lead', 'lead')
        .where('lead."userInformationsId" IN (:...userInformationsIds)', {
          userInformationsIds
        })
        .andWhere('lead.state = :activeState', {
          activeState: LeadState.ACTIVE
        })
        .andWhere('followup.status = :pendingStatus', {
          pendingStatus: FollowUpStatus.PENDING
        })
        .select(
          'COALESCE(SUM(CASE WHEN followup."dueAt" < :startOfToday THEN 1 ELSE 0 END), 0)',
          'overdue'
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN followup."dueAt" >= :startOfToday AND followup."dueAt" <= :endOfToday THEN 1 ELSE 0 END), 0)',
          'today'
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN followup."dueAt" > :endOfToday THEN 1 ELSE 0 END), 0)',
          'scheduled'
        )
        .setParameters({
          startOfToday,
          endOfToday
        })
        .getRawOne<{ overdue: string; today: string; scheduled: string }>(),
      this.negotiationRepo
        .createQueryBuilder('negotiation')
        .innerJoin('negotiation.lead', 'lead')
        .where('lead."userInformationsId" IN (:...userInformationsIds)', {
          userInformationsIds
        })
        .andWhere('lead.state = :activeState', {
          activeState: LeadState.ACTIVE
        })
        .andWhere('negotiation.stage = :wonStage', {
          wonStage: NegotiationStage.WON
        })
        .andWhere('negotiation.value IS NOT NULL')
        .andWhere('negotiation."closedAt" IS NOT NULL')
        .andWhere('negotiation."closedAt" >= :revenueStartAt', {
          revenueStartAt
        })
        .andWhere('negotiation."closedAt" <= :revenueEndAt', {
          revenueEndAt
        })
        .select('COALESCE(SUM(negotiation.value), 0)', 'revenue')
        .getRawOne<{ revenue: string }>()
    ])

    const parsedRevenue = Number.parseFloat(revenueRaw?.revenue ?? '0')

    return {
      activeLeads,
      newToday,
      withoutConversation24h,
      followUps: {
        overdue: Number(followUpsRaw?.overdue ?? 0),
        today: Number(followUpsRaw?.today ?? 0),
        scheduled: Number(followUpsRaw?.scheduled ?? 0)
      },
      revenue: Number.isFinite(parsedRevenue) ? parsedRevenue : 0
    }
  }

  async getIncome(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<DashboardIncomeResponse> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return { income: 0 }
    }

    const { rangeStart, rangeEnd } = this.resolveDateRange(startDate, endDate)

    const incomeRaw = await this.negotiationRepo
      .createQueryBuilder('negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })
      .andWhere('lead.state = :activeState', {
        activeState: LeadState.ACTIVE
      })
      .andWhere('negotiation.stage = :wonStage', {
        wonStage: NegotiationStage.WON
      })
      .andWhere('negotiation.value IS NOT NULL')
      .andWhere('negotiation."closedAt" IS NOT NULL')
      .andWhere('negotiation."closedAt" >= :rangeStart', {
        rangeStart
      })
      .andWhere('negotiation."closedAt" <= :rangeEnd', {
        rangeEnd
      })
      .select('COALESCE(SUM(negotiation.value), 0)', 'income')
      .getRawOne<{ income: string }>()

    const parsedIncome = Number.parseFloat(incomeRaw?.income ?? '0')

    return {
      income: Number.isFinite(parsedIncome) ? parsedIncome : 0
    }
  }

  private async findUserInformationsIds(userId: string): Promise<string[]> {
    const mappings = await this.userInformationsRepo.find({
      where: { userId },
      select: ['id']
    })

    return mappings.map((mapping) => mapping.id)
  }

  private resolveDateRange(startDate?: string, endDate?: string) {
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const rangeStart = startDate
      ? this.parseDateBoundary(startDate, 'start')
      : startOfToday
    const rangeEnd = endDate
      ? this.parseDateBoundary(endDate, 'end')
      : endOfToday

    if (rangeStart > rangeEnd) {
      throw new BadRequestException('startDate must be before endDate')
    }

    return { rangeStart, rangeEnd }
  }

  private parseDateBoundary(value: string, boundary: DateBoundary): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    if (isDateOnly) {
      const [yearText, monthText, dayText] = value.split('-')
      const year = Number(yearText)
      const month = Number(monthText)
      const day = Number(dayText)

      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
      ) {
        throw new BadRequestException('Invalid date range')
      }

      if (boundary === 'start') {
        return new Date(year, month - 1, day, 0, 0, 0, 0)
      }

      return new Date(year, month - 1, day, 23, 59, 59, 999)
    }

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date range')
    }

    return parsed
  }

}

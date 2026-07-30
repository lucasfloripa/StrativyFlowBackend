import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import { Lead, LeadState } from '../leads/entities/lead.entity'
import { MessageDirection } from '../leads/entities/message.entity'
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
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async getSummary(userId: string): Promise<DashboardSummary> {
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
        }
      }
    }

    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const [activeLeads, newToday, withoutConversation24h, followUpsRaw] =
      await Promise.all([
        this.leadRepo.count({
          where: {
            userInformationsId: In(userInformationsIds),
            state: LeadState.ACTIVE
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
          .andWhere('lead."createdAt" >= :twentyFourHoursAgo', {
            twentyFourHoursAgo
          })
          .andWhere(
            `NOT EXISTS (
              SELECT 1
              FROM messages message
              WHERE message."leadId" = lead.id::text
                AND message.direction = :outboundDirection
            )`,
            { outboundDirection: MessageDirection.OUTBOUND }
          )
          .getCount(),
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
          .andWhere(
            `NOT (
              EXISTS (SELECT 1 FROM negotiations n WHERE n."leadId" = lead.id)
              AND NOT EXISTS (
                SELECT 1 FROM negotiations n
                WHERE n."leadId" = lead.id
                  AND (n."closedAt" IS NULL OR n.stage NOT IN ('WON', 'LOST'))
              )
            )`
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
          .getRawOne<{ overdue: string; today: string; scheduled: string }>()
      ])

    return {
      activeLeads,
      newToday,
      withoutConversation24h,
      followUps: {
        overdue: Number(followUpsRaw?.overdue ?? 0),
        today: Number(followUpsRaw?.today ?? 0),
        scheduled: Number(followUpsRaw?.scheduled ?? 0)
      }
    }
  }

  private async findUserInformationsIds(userId: string): Promise<string[]> {
    const mappings = await this.userInformationsRepo.find({
      where: { userId },
      select: ['id']
    })

    return mappings.map((mapping) => mapping.id)
  }
}

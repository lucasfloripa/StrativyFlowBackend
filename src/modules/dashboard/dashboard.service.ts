import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import { Lead, LeadRuntimeMode, LeadState } from '../leads/entities/lead.entity'
import { MessageDirection, MessageType } from '../leads/entities/message.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { DashboardConversationFilter } from './dto/dashboard-conversations-query.dto'
import {
  DashboardConversationItemDto,
  DashboardConversationStatus,
  DashboardConversationsResponseDto
} from './dto/dashboard-conversations-response.dto'

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

type DashboardConversationRow = {
  leadId: string
  leadName: string
  source: string | null
  leadCreatedAt: Date | string
  lastMessageAt: Date | string
  lastMessage: string | null
  lastMessageDirection: MessageDirection
  lastMessageType: MessageType
  firstInboundAt: Date | string | null
  lastInboundAt: Date | string | null
  hasOutbound: boolean
  runtimeMode: LeadRuntimeMode
}

type ClassifiedDashboardConversation = DashboardConversationItemDto & {
  isWithinFirst72Hours: boolean
  hasOpenMetaWindow: boolean
  hasNoResponse24h: boolean
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
                AND (message.metadata->>'runtimeMode') IS DISTINCT FROM :automationRuntimeMode
            )`,
            {
              outboundDirection: MessageDirection.OUTBOUND,
              automationRuntimeMode: LeadRuntimeMode.AUTOMATION
            }
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
              WHERE message."leadId"::text = lead.id::text
            )`
          )
          .andWhere(
            `NOT EXISTS (
              SELECT 1
              FROM messages message
              WHERE message."leadId"::text = lead.id::text
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

  async getConversations(
    userId: string,
    filter: DashboardConversationFilter
  ): Promise<DashboardConversationsResponseDto> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return {
        filter,
        counts: {
          all: 0,
          new: 0,
          last72h: 0,
          today: 0,
          noResponse24h: 0
        },
        items: []
      }
    }

    const rows = await this.leadRepo.query<DashboardConversationRow[]>(
      `
        SELECT
          lead.id AS "leadId",
          lead.name AS "leadName",
          lead.source AS source,
          lead."createdAt" AS "leadCreatedAt",
          lead."runtimeMode" AS "runtimeMode",
          latest_message."createdAt" AS "lastMessageAt",
          latest_message.content AS "lastMessage",
          latest_message.direction AS "lastMessageDirection",
          latest_message.type AS "lastMessageType",
          message_stats."firstInboundAt" AS "firstInboundAt",
          message_stats."lastInboundAt" AS "lastInboundAt",
          COALESCE(message_stats."hasOutbound", FALSE) AS "hasOutbound"
        FROM leads lead
        INNER JOIN LATERAL (
          SELECT
            message."createdAt",
            message.content,
            message.direction,
            message.type
          FROM messages message
          WHERE message."leadId" = lead.id::text
            AND message.direction IN ($2, $3, $5)
          ORDER BY message."createdAt" DESC, message.id DESC
          LIMIT 1
        ) latest_message ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MIN(message."createdAt") FILTER (
              WHERE message.direction = $2
            ) AS "firstInboundAt",
            MAX(message."createdAt") FILTER (
              WHERE message.direction = $2
            ) AS "lastInboundAt",
            BOOL_OR(
              message.direction = $3
              AND (message.metadata->>'runtimeMode') IS DISTINCT FROM $4
            ) AS "hasOutbound"
          FROM messages message
          WHERE message."leadId" = lead.id::text
        ) message_stats ON TRUE
        WHERE lead."userInformationsId"::text = ANY($1::text[])
      `,
      [
        userInformationsIds,
        MessageDirection.INBOUND,
        MessageDirection.OUTBOUND,
        LeadRuntimeMode.AUTOMATION,
        MessageDirection.AUTOMATIC
      ]
    )

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
    const conversations = rows.map((row) =>
      this.classifyConversation(row, twentyFourHoursAgo, seventyTwoHoursAgo)
    )

    const counts = {
      all: conversations.length,
      new: conversations.filter((conversation) => conversation.isNew).length,
      last72h: conversations.filter(
        (conversation) => conversation.isWithinFirst72Hours
      ).length,
      today: conversations.filter(
        (conversation) => conversation.hasOpenMetaWindow
      ).length,
      noResponse24h: conversations.filter(
        (conversation) => conversation.hasNoResponse24h
      ).length
    }

    const filteredConversations = conversations
      .filter((conversation) => {
        if (filter === DashboardConversationFilter.NEW) {
          return conversation.isNew
        }

        if (filter === DashboardConversationFilter.LAST_72H) {
          return conversation.isWithinFirst72Hours
        }

        if (filter === DashboardConversationFilter.TODAY) {
          return conversation.hasOpenMetaWindow
        }

        if (filter === DashboardConversationFilter.NO_RESPONSE_24H) {
          return conversation.hasNoResponse24h
        }

        return true
      })
      .sort((first, second) => {
        if (
          filter === DashboardConversationFilter.ALL &&
          first.isNew !== second.isNew
        ) {
          return first.isNew ? -1 : 1
        }

        return second.leadCreatedAt.getTime() - first.leadCreatedAt.getTime()
      })
      .map((conversation) => this.toConversationItem(conversation))

    return {
      filter,
      counts,
      items: filteredConversations
    }
  }

  private classifyConversation(
    row: DashboardConversationRow,
    twentyFourHoursAgo: Date,
    seventyTwoHoursAgo: Date
  ): ClassifiedDashboardConversation {
    const leadCreatedAt = new Date(row.leadCreatedAt)
    const lastMessageAt = new Date(row.lastMessageAt)
    const firstInboundAt = row.firstInboundAt
      ? new Date(row.firstInboundAt)
      : null
    const lastInboundAt = row.lastInboundAt ? new Date(row.lastInboundAt) : null
    const isNew = leadCreatedAt >= twentyFourHoursAgo && !row.hasOutbound
    const hasCompletedFirst72Hours =
      firstInboundAt !== null && firstInboundAt <= seventyTwoHoursAgo
    const isWithinFirst72Hours =
      row.hasOutbound &&
      firstInboundAt !== null &&
      firstInboundAt > seventyTwoHoursAgo
    const hasOpenMetaWindow =
      row.hasOutbound &&
      hasCompletedFirst72Hours &&
      lastInboundAt !== null &&
      lastInboundAt > twentyFourHoursAgo
    const hasNoResponse24h =
      row.hasOutbound &&
      hasCompletedFirst72Hours &&
      lastInboundAt !== null &&
      lastInboundAt <= twentyFourHoursAgo
    let status: DashboardConversationStatus | null = null

    if (isNew) {
      status = 'new'
    } else if (isWithinFirst72Hours) {
      status = 'last72h'
    } else if (hasOpenMetaWindow) {
      status = 'today'
    } else if (hasNoResponse24h) {
      status = 'noResponse24h'
    }

    return {
      leadId: row.leadId,
      leadName: row.leadName,
      source: row.source,
      leadCreatedAt,
      lastMessageAt,
      lastMessage: row.lastMessage,
      lastMessageDirection: row.lastMessageDirection,
      lastMessageType: row.lastMessageType,
      isNew,
      status,
      runtimeMode: row.runtimeMode,
      isWithinFirst72Hours,
      hasOpenMetaWindow,
      hasNoResponse24h
    }
  }

  private toConversationItem(
    conversation: ClassifiedDashboardConversation
  ): DashboardConversationItemDto {
    return {
      leadId: conversation.leadId,
      leadName: conversation.leadName,
      source: conversation.source,
      leadCreatedAt: conversation.leadCreatedAt,
      lastMessageAt: conversation.lastMessageAt,
      lastMessage: conversation.lastMessage,
      lastMessageDirection: conversation.lastMessageDirection,
      lastMessageType: conversation.lastMessageType,
      isNew: conversation.isNew,
      status: conversation.status,
      runtimeMode: conversation.runtimeMode
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

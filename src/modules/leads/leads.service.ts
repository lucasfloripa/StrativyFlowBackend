import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { In, Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import {
  Notification,
  NotificationReferenceType
} from '../notification/entities/notification.entity'
import { RabbitPublisherService } from '../rabbit/services/rabbit-publisher.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { CreateLeadDto } from './dtos/create-lead.dto'
import { UpdateLeadDto } from './dtos/update-lead.dto'
import {
  Lead,
  LeadQualification,
  LeadRuntimeMode,
  LeadSocialLinks,
  LeadState
} from './entities/lead.entity'
import {
  Message,
  MessageDirection,
  MessageType
} from './entities/message.entity'

type WhatsAppSendMessageResponse = {
  messaging_product: string
  contacts: {
    input: string
    wa_id: string
  }[]
  messages: {
    id: string
  }[]
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name)
  private static readonly SEARCHABLE_FILTERS = new Set([
    'id',
    'name',
    'phone',
    'email',
    'source',
    'leadQualification',
    'state',
    'runtimeMode',
    'flowState',
    'isFavorite'
  ])

  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    private readonly rabbitPublisherService: RabbitPublisherService
  ) {}

  async publishRabbitTestMessage(
    userId: string,
    body?: { routingKey?: string; payload?: unknown }
  ): Promise<{ success: boolean; routingKey: string }> {
    const routingKey = body?.routingKey ?? 'strativy.flow.test'

    await this.rabbitPublisherService.publish(routingKey, {
      userId,
      triggeredAt: new Date().toISOString(),
      payload: body?.payload ?? {}
    })

    return {
      success: true,
      routingKey
    }
  }

  private async findUserInformationsIds(userId: string): Promise<string[]> {
    const mappings = await this.userInformationsRepo.find({
      where: { userId },
      select: ['id']
    })

    return mappings.map((mapping) => mapping.id)
  }

  private async findDefaultUserInformationsId(userId: string): Promise<string> {
    const mapping = await this.userInformationsRepo.findOne({
      where: { userId },
      order: { createdAt: 'ASC' }
    })

    if (!mapping) {
      throw new BadRequestException(
        'User has no phone mapping configured for leads'
      )
    }

    return mapping.id
  }

  async searchByUser(
    userId: string,
    filters: Record<string, string | string[] | undefined>
  ) {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return []
    }

    const queryBuilder = this.leadRepo
      .createQueryBuilder('lead')
      .addSelect(
        (subQuery) =>
          subQuery
            .select(
              "TO_CHAR(MAX(message.\"createdAt\" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI:SS.MS')"
            )
            .from(Message, 'message')
            .where('message."leadId" = lead.id::text')
            .andWhere('message.direction IN (:...messageDirections)'),
        'lastMessageAt'
      )
      .where('lead."userInformationsId" IN (:...userInformationsIds)', {
        userInformationsIds
      })
      .setParameter('messageDirections', [
        MessageDirection.INBOUND,
        MessageDirection.OUTBOUND
      ])

    for (const [key, rawValue] of Object.entries(filters)) {
      if (!LeadsService.SEARCHABLE_FILTERS.has(key)) {
        continue
      }

      const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
      if (typeof value === 'undefined') {
        continue
      }

      const normalized = value.trim()
      if (!normalized) {
        continue
      }

      if (key === 'isFavorite') {
        if (normalized !== 'true' && normalized !== 'false') {
          throw new BadRequestException('isFavorite must be true or false')
        }

        queryBuilder.andWhere('lead."isFavorite" = :isFavorite', {
          isFavorite: normalized === 'true'
        })
        continue
      }

      if (key === 'name') {
        queryBuilder.andWhere('lead.name ILIKE :name', {
          name: `%${normalized}%`
        })
        continue
      }

      queryBuilder.andWhere(`lead."${key}" = :${key}`, {
        [key]: normalized
      })
    }

    const { entities, raw } = await queryBuilder
      .orderBy('lead."createdAt"', 'DESC')
      .getRawAndEntities()
    const rawRows = raw as Array<{ lastMessageAt: string | null }>

    return entities.map((lead, index) => ({
      ...lead,
      nextFollowUpDueAt: null,
      lastMessageAt: rawRows[index]?.lastMessageAt ?? null
    }))
  }

  async listByUser(userId: string) {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    if (!userInformationsIds.length) {
      return []
    }

    const leads = await this.leadRepo.find({
      where: {
        userInformationsId: In(userInformationsIds)
      },
      order: {
        createdAt: 'DESC'
      }
    })

    if (!leads.length) {
      return []
    }

    const leadIds = leads.map((lead) => lead.id)

    const lastMessageRows = await this.messageRepo
      .createQueryBuilder('message')
      .select('message."leadId"', 'leadId')
      .addSelect(
        "TO_CHAR(MAX(message.\"createdAt\" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI:SS.MS')",
        'lastMessageAt'
      )
      .where('message."leadId" IN (:...leadIds)', { leadIds })
      .groupBy('message."leadId"')
      .getRawMany<{ leadId: string; lastMessageAt: string | null }>()

    const lastMessageAtMap = new Map<string, string | null>(
      lastMessageRows.map((row) => [row.leadId, row.lastMessageAt])
    )

    const nextFollowUpRows = await this.followUpRepo
      .createQueryBuilder('followup')
      .innerJoin('followup.negotiation', 'negotiation')
      .select('negotiation."leadId"', 'leadId')
      .addSelect('followup."negotiationId"', 'negotiationId')
      .addSelect('followup."dueAt"', 'nextFollowUpDueAt')
      .where('negotiation."leadId" IN (:...leadIds)', { leadIds })
      .andWhere('"followup"."status" = :pendingStatus', {
        pendingStatus: FollowUpStatus.PENDING
      })
      .orderBy('negotiation."leadId"', 'ASC')
      .addOrderBy('followup."dueAt"', 'ASC')
      .getRawMany<{
        leadId: string
        negotiationId: string
        nextFollowUpDueAt: string | null
      }>()

    const nextFollowUpMap = new Map<
      string,
      { dueAt: string | null; negotiationId: string | null }
    >()

    for (const row of nextFollowUpRows) {
      if (!nextFollowUpMap.has(row.leadId)) {
        nextFollowUpMap.set(row.leadId, {
          dueAt: row.nextFollowUpDueAt,
          negotiationId: row.negotiationId ?? null
        })
      }
    }

    const nextFollowUpByLeadId = (leadId: string) =>
      nextFollowUpMap.get(leadId) ?? { dueAt: null, negotiationId: null }

    return leads.map((lead) => {
      const nextFollowUp = nextFollowUpByLeadId(lead.id)

      return {
        ...lead,
        nextFollowUpDueAt: nextFollowUp.dueAt,
        nextFollowUpNegotiationId: nextFollowUp.negotiationId,
        topFollowUpStatus: null,
        lastMessageAt: lastMessageAtMap.get(lead.id) ?? null,
        hasFollowUpOverdue: false,
        hasFollowUpToday: false,
        hasFollowUpScheduled: false,
        hasAnyFollowUp: false
      }
    })
  }

  async create(userId: string, dto: CreateLeadDto) {
    const userInformationsId = await this.findDefaultUserInformationsId(userId)
    const nextLeadQualification = this.normalizeLeadQualification(
      dto.leadQualification
    )
    const nextSocialLinks = this.normalizeLeadSocialLinks(dto.socialLinks)
    const lead = this.leadRepo.create({
      userInformationsId,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      source: dto.source,
      socialLinks: nextSocialLinks,
      leadQualification: nextLeadQualification,
      state: dto.state ?? LeadState.ACTIVE,
      runtimeMode: dto.runtimeMode ?? LeadRuntimeMode.AUTOMATION,
      lastActivityAt: new Date()
    })

    const createdLead = await this.leadRepo.save(lead)

    await this.rabbitPublisherService.publish('lead.created', {
      leadId: createdLead.id,
      userId,
      origin: 'app',
      organizationId: null,
      userInformationsId: createdLead.userInformationsId,
      leadName: createdLead.name,
      description: createdLead.name,
      source: createdLead.source ?? null,
      createdAt: createdLead.createdAt
    })

    return createdLead
  }

  private async findOneEntity(userId: string, id: string): Promise<Lead> {
    const lead = await this.leadRepo.findOne({ where: { id } })
    if (!lead) throw new NotFoundException('Lead not found')

    if (!lead.userInformationsId) {
      throw new ForbiddenException('Lead has no user informations')
    }

    const ownershipMapping = await this.userInformationsRepo.findOne({
      where: {
        id: lead.userInformationsId,
        userId
      }
    })

    if (!ownershipMapping) {
      throw new ForbiddenException('Lead does not belong to user')
    }

    return lead
  }

  async findOne(userId: string, id: string) {
    const lead = await this.findOneEntity(userId, id)

    const messageSummary = await this.messageRepo
      .createQueryBuilder('message')
      .select('COUNT(message.id)', 'totalMessages')
      .addSelect(
        "TO_CHAR(MAX(message.\"createdAt\" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI:SS.MS')",
        'lastMessageAt'
      )
      .where('message."leadId" = :leadId', { leadId: lead.id })
      .andWhere('message.direction IN (:...messageDirections)', {
        messageDirections: [MessageDirection.INBOUND, MessageDirection.OUTBOUND]
      })
      .getRawOne<{ totalMessages: string; lastMessageAt: string | null }>()

    return {
      ...lead,
      lastMessageAt: messageSummary?.lastMessageAt ?? null,
      totalMessages: Number(messageSummary?.totalMessages ?? 0)
    }
  }

  async getLeadMessages(userId: string, leadId: string) {
    await this.findOneEntity(userId, leadId)

    const messages = await this.messageRepo.find({
      where: { leadId },
      order: { createdAt: 'ASC' }
    })

    return messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      content: message.content ?? null,
      type: message.type,
      createdAt: message.createdAt
    }))
  }

  async getLeadFollowUps(
    userId: string,
    leadId: string,
    query: Record<string, string | string[] | undefined>
  ) {
    const lead = await this.findOneEntity(userId, leadId)

    const page = Math.max(
      1,
      Number(Array.isArray(query.page) ? query.page[0] : query.page) || 1
    )
    const limit = Math.max(
      1,
      Number(Array.isArray(query.limit) ? query.limit[0] : query.limit) || 13
    )
    const statusFocusValue = Array.isArray(query.statusFocus)
      ? query.statusFocus[0]
      : query.statusFocus
    const dateOrderValue = Array.isArray(query.dateOrder)
      ? query.dateOrder[0]
      : query.dateOrder

    const statusFocus = this.normalizeFollowUpStatusFocus(statusFocusValue)
    const dateOrder = dateOrderValue === 'desc' ? 'DESC' : 'ASC'

    const followUps = await this.followUpRepo
      .createQueryBuilder('followUp')
      .innerJoin('followUp.negotiation', 'negotiation')
      .where('negotiation."leadId" = :leadId', { leadId: lead.id })
      .getMany()

    const items = [...followUps].sort((firstFollowUp, secondFollowUp) => {
      const firstPriority = this.getFollowUpPriority(firstFollowUp, statusFocus)
      const secondPriority = this.getFollowUpPriority(
        secondFollowUp,
        statusFocus
      )

      if (firstPriority !== secondPriority) {
        return firstPriority - secondPriority
      }

      const firstDueAt = new Date(firstFollowUp.dueAt).getTime()
      const secondDueAt = new Date(secondFollowUp.dueAt).getTime()

      if (firstDueAt !== secondDueAt) {
        return dateOrder === 'ASC'
          ? firstDueAt - secondDueAt
          : secondDueAt - firstDueAt
      }

      const firstCreatedAt = new Date(firstFollowUp.createdAt).getTime()
      const secondCreatedAt = new Date(secondFollowUp.createdAt).getTime()

      return secondCreatedAt - firstCreatedAt
    })

    const totalItems = items.length
    const paginatedItems = items.slice(
      (page - 1) * limit,
      (page - 1) * limit + limit
    )

    const totalPages = Math.max(1, Math.ceil(totalItems / limit))

    return {
      items: paginatedItems,
      page,
      limit,
      totalItems,
      totalPages
    }
  }

  async sendLeadMessage(
    userId: string,
    leadId: string,
    body: { content: string }
  ) {
    const lead = await this.findOneEntity(userId, leadId)

    if (!lead.phone?.trim()) {
      throw new BadRequestException('Lead phone is missing')
    }

    const userInformations = lead.userInformationsId
      ? await this.userInformationsRepo.findOne({
          where: { id: lead.userInformationsId }
        })
      : null

    const phoneNumberId =
      userInformations?.phoneNumberId?.trim() ||
      process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!phoneNumberId?.trim()) {
      throw new BadRequestException(
        'WhatsApp phoneNumberId is not configured for this lead'
      )
    }

    const content = body.content?.trim()

    if (!content) {
      throw new BadRequestException('Message content is required')
    }

    const response = await this.sendWhatsAppMessage(
      lead.phone,
      content,
      phoneNumberId
    )

    lead.lastActivityAt = new Date()
    await this.leadRepo.save(lead)

    const savedMessage = await this.messageRepo.save(
      this.messageRepo.create({
        leadId: lead.id,
        direction: MessageDirection.OUTBOUND,
        content,
        type: MessageType.TEXT,
        whatsappMessageId: response.data.messages[0]?.id ?? null,
        metadata: {
          whatsappResponse: response.data
        }
      })
    )

    return {
      success: true,
      message: {
        id: savedMessage.id,
        leadId: savedMessage.leadId,
        direction: savedMessage.direction,
        content: savedMessage.content,
        type: savedMessage.type,
        whatsappMessageId: savedMessage.whatsappMessageId,
        createdAt: savedMessage.createdAt
      }
    }
  }

  private getFollowUpPriority(
    followUp: FollowUp,
    focus: 'overdue' | 'today' | 'scheduled' | 'completed'
  ): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueAt = new Date(followUp.dueAt)
    const dueAtDay = new Date(dueAt)
    dueAtDay.setHours(0, 0, 0, 0)

    const derivedStatus =
      String(followUp.status).trim().toLowerCase() === 'done'
        ? 'completed'
        : dueAtDay < today
          ? 'overdue'
          : dueAtDay.getTime() === today.getTime()
            ? 'today'
            : 'scheduled'

    const orderedStatusesByFocus: Record<
      'overdue' | 'today' | 'scheduled' | 'completed',
      Array<'overdue' | 'today' | 'scheduled' | 'completed'>
    > = {
      overdue: ['overdue', 'today', 'scheduled', 'completed'],
      today: ['today', 'scheduled', 'completed', 'overdue'],
      scheduled: ['scheduled', 'completed', 'overdue', 'today'],
      completed: ['completed', 'overdue', 'today', 'scheduled']
    }

    const orderedStatuses = orderedStatusesByFocus[focus]

    return orderedStatuses.indexOf(derivedStatus)
  }

  private async sendWhatsAppMessage(
    to: string,
    reply: string,
    phoneNumberId: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    return axios.post(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
  }

  async update(userId: string, id: string, dto: UpdateLeadDto) {
    const lead = await this.findOneEntity(userId, id)
    let shouldRefreshLastActivityAt = false
    const nextLeadQualification = this.normalizeLeadQualification(
      dto.leadQualification
    )
    const nextSocialLinks = this.normalizeLeadSocialLinks(dto.socialLinks)

    if (typeof dto.name !== 'undefined') lead.name = dto.name
    if (typeof dto.phone !== 'undefined') lead.phone = dto.phone
    if (typeof dto.email !== 'undefined') lead.email = dto.email
    if (typeof dto.source !== 'undefined') lead.source = dto.source
    if (typeof nextSocialLinks !== 'undefined') {
      lead.socialLinks = nextSocialLinks
    }
    if (
      typeof nextLeadQualification !== 'undefined' &&
      nextLeadQualification !== lead.leadQualification
    ) {
      lead.leadQualification = nextLeadQualification
      shouldRefreshLastActivityAt = true
    }
    if (typeof dto.state !== 'undefined' && dto.state !== lead.state) {
      lead.state = dto.state
      if (dto.state === LeadState.ARCHIVED) {
        lead.isFavorite = false
      }
      shouldRefreshLastActivityAt = true
    }
    if (shouldRefreshLastActivityAt) {
      lead.lastActivityAt = new Date()
    }

    return this.leadRepo.save(lead)
  }

  async archive(userId: string, id: string, state: LeadState) {
    const lead = await this.findOneEntity(userId, id)
    lead.state = state
    if (state === LeadState.ARCHIVED) {
      lead.isFavorite = false
    }
    return this.leadRepo.save(lead)
  }

  async toggleFavorite(userId: string, id: string, isFavorite: boolean) {
    const lead = await this.findOneEntity(userId, id)
    lead.isFavorite = isFavorite
    return this.leadRepo.save(lead)
  }

  async updateRuntimeMode(
    userId: string,
    id: string,
    runtimeMode: LeadRuntimeMode
  ) {
    const lead = await this.findOneEntity(userId, id)

    if (lead.runtimeMode !== runtimeMode) {
      lead.runtimeMode = runtimeMode
      lead.lastActivityAt = new Date()

      if (runtimeMode === LeadRuntimeMode.HUMAN) {
        this.logger.log(`Lead ${lead.id} switched to HUMAN mode`)
      } else {
        this.logger.log(`Lead ${lead.id} switched to AUTOMATION mode`)
      }
    }

    return this.leadRepo.save(lead)
  }

  async remove(userId: string, id: string) {
    const lead = await this.findOneEntity(userId, id)

    return this.leadRepo.manager.transaction(async (manager) => {
      const leadFollowUps = await this.followUpRepo
        .createQueryBuilder('followup')
        .innerJoin('followup.negotiation', 'negotiation')
        .select('followup.id', 'id')
        .where('negotiation."leadId" = :leadId', { leadId: lead.id })
        .getRawMany<{ id: string }>()

      await manager
        .createQueryBuilder()
        .delete()
        .from(Notification)
        .where('"referenceId" = :leadId', { leadId: lead.id })
        .andWhere('"referenceType" IN (:...referenceTypes)', {
          referenceTypes: [
            NotificationReferenceType.LEAD,
            NotificationReferenceType.MESSAGE
          ]
        })
        .execute()

      const followUpIds = leadFollowUps.map((followUp) => followUp.id)

      if (followUpIds.length) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(Notification)
          .where('"referenceType" = :referenceType', {
            referenceType: NotificationReferenceType.FOLLOW_UP
          })
          .andWhere('"referenceId" IN (:...followUpIds)', { followUpIds })
          .execute()
      }

      await manager.delete(Message, { leadId: lead.id })
      return manager.delete(Lead, { id: lead.id })
    })
  }

  private normalizeFollowUpStatusFocus(
    value: string | undefined
  ): 'overdue' | 'today' | 'scheduled' | 'completed' {
    if (value === 'today' || value === 'scheduled' || value === 'completed') {
      return value
    }

    return 'overdue'
  }

  private normalizeLeadQualification(
    value: unknown
  ): LeadQualification | null | undefined {
    if (typeof value === 'undefined') {
      return undefined
    }

    if (value === null) {
      return null
    }

    if (
      value === LeadQualification.QUALIFY ||
      value === LeadQualification.NOT_QUALIFY
    ) {
      return value
    }

    return undefined
  }

  private normalizeLeadSocialLinks(
    value: unknown
  ): Partial<Record<LeadSocialLinks, string>> | null | undefined {
    if (typeof value === 'undefined') {
      return undefined
    }

    if (value === null) {
      return null
    }

    if (typeof value !== 'object') {
      return undefined
    }

    const source = value as Record<string, unknown>
    const normalized: Partial<Record<LeadSocialLinks, string>> = {}

    const instagram = source[LeadSocialLinks.INSTAGRAM]
    if (typeof instagram === 'string') {
      normalized[LeadSocialLinks.INSTAGRAM] = instagram
    }

    const url = source[LeadSocialLinks.URL]
    if (typeof url === 'string') {
      normalized[LeadSocialLinks.URL] = url
    }

    return normalized
  }

  async upsertFromWhatsapp(
    userId: string,
    dto: CreateLeadDto & { lastMessage?: string }
  ) {
    const phone = (dto.phone ?? '').trim()
    if (!phone) throw new BadRequestException('phone is required')

    const userInformationsId = await this.findDefaultUserInformationsId(userId)

    const existing = await this.leadRepo.findOne({
      where: {
        userInformationsId,
        phone,
        state: LeadState.ACTIVE
      }
    })

    if (existing) {
      if (dto.name && dto.name !== existing.name) existing.name = dto.name
      if (dto.email && dto.email !== existing.email) existing.email = dto.email
      if (dto.source && dto.source !== existing.source)
        existing.source = dto.source
      const nextSocialLinks = this.normalizeLeadSocialLinks(dto.socialLinks)
      if (
        typeof nextSocialLinks !== 'undefined' &&
        nextSocialLinks !== existing.socialLinks
      ) {
        existing.socialLinks = nextSocialLinks
      }
      if (dto.state && dto.state !== existing.state) {
        existing.state = dto.state
      }

      return this.leadRepo.save(existing)
    }

    const lead = this.leadRepo.create({
      userInformationsId,
      name: dto.name,
      phone,
      email: dto.email,
      source: dto.source ?? 'whatsapp',
      socialLinks: this.normalizeLeadSocialLinks(dto.socialLinks),
      leadQualification: this.normalizeLeadQualification(dto.leadQualification),
      state: dto.state ?? LeadState.ACTIVE,
      lastActivityAt: new Date(),
      runtimeMode: dto.runtimeMode ?? LeadRuntimeMode.AUTOMATION
    })

    const createdLead = await this.leadRepo.save(lead)

    await this.rabbitPublisherService.publish('lead.created', {
      leadId: createdLead.id,
      userId,
      origin: 'whatsapp',
      organizationId: null,
      userInformationsId: createdLead.userInformationsId,
      leadName: createdLead.name,
      description: createdLead.name,
      source: createdLead.source ?? null,
      createdAt: createdLead.createdAt
    })

    return createdLead
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { DataSource, EntityManager, Repository } from 'typeorm'

import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'

import { CreateLeadDto } from './dtos/create-lead.dto'
import { MoveLeadDto } from './dtos/move-lead.dto'
import { UpdateLeadDto } from './dtos/update-lead.dto'
import { LeadFollowUp } from './entities/lead-followup.entity'
import { Lead, LeadRuntimeMode, LeadState } from './entities/lead.entity'
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

  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnRepo: Repository<BoardColumn>,
    private readonly dataSource: DataSource
  ) {}

  private async assertBoardOwnership(userId: string, boardId: string) {
    const board = await this.boardRepo.findOne({ where: { id: boardId } })
    if (!board) throw new NotFoundException('Board not found')
    if (board.userId !== userId)
      throw new ForbiddenException('Board does not belong to user')
    if (board.isArchived) throw new BadRequestException('Board is archived')
    return board
  }

  private async getFirstColumnId(boardId: string) {
    const first = await this.columnRepo.findOne({
      where: { boardId },
      order: { position: 'ASC', createdAt: 'ASC' }
    })
    if (!first) throw new BadRequestException('Board has no columns')
    return first.id
  }

  private async getNextPosition(boardId: string, columnId: string) {
    const max = await this.leadRepo
      .createQueryBuilder('l')
      .select('MAX(l.position)', 'max')
      .where('l.boardId = :boardId', { boardId })
      .andWhere('l.columnId = :columnId', { columnId })
      .andWhere('l.state != :archivedState', {
        archivedState: LeadState.ARCHIVED
      })
      .getRawOne<{ max: string | null }>()
    const maxPos = max?.max ? Number(max.max) : -1
    return maxPos + 1
  }

  private async executeOnEnterAutomation(
    manager: EntityManager,
    lead: Lead,
    column: BoardColumn,
    eventAt: Date
  ) {
    const onEnter = column.onEnter
    if (!onEnter) return lead

    const followUpRepository = manager.getRepository(LeadFollowUp)

    if (onEnter.markAllFollowUpsAsDone) {
      await followUpRepository
        .createQueryBuilder()
        .update(LeadFollowUp)
        .set({
          status: 'done',
          completedAt: eventAt
        })
        .where('"leadId" = :leadId', { leadId: lead.id })
        .andWhere('"status" != :doneStatus', { doneStatus: 'done' })
        .execute()
    }

    if (onEnter.createFollowUp) {
      const followUp = followUpRepository.create({
        leadId: lead.id,
        value: onEnter.createFollowUp.value,
        dueAt: onEnter.createFollowUp.dueAt
          ? new Date(onEnter.createFollowUp.dueAt)
          : eventAt,
        status: 'pending',
        completedAt: null
      })

      await followUpRepository.save(followUp)
    }

    if (onEnter.favoriteLead) {
      lead.isFavorite = true
    }

    if (onEnter.resetLastActivityAt) {
      lead.lastActivityAt = eventAt
    }

    if (onEnter.setTemperature) {
      lead.temperature = onEnter.setTemperature
    }

    return lead
  }

  async create(userId: string, dto: CreateLeadDto) {
    await this.assertBoardOwnership(userId, dto.boardId)

    const columnId = dto.columnId ?? (await this.getFirstColumnId(dto.boardId))

    const column = await this.columnRepo.findOne({
      where: { id: columnId, boardId: dto.boardId }
    })
    if (!column) throw new NotFoundException('Column not found in this board')

    const position = await this.getNextPosition(dto.boardId, columnId)

    const lead = this.leadRepo.create({
      boardId: dto.boardId,
      columnId,
      position,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      source: dto.source,
      companyName: dto.companyName,
      notes: dto.notes,
      initialContext: dto.initialContext,
      temperature: dto.temperature ?? null,
      outcome: dto.outcome ?? null,
      state: dto.state ?? LeadState.ACTIVE,
      runtimeMode: dto.runtimeMode ?? LeadRuntimeMode.AUTOMATION,
      movedAt: new Date(),
      lastActivityAt: new Date()
    })
    const savedLead = await this.leadRepo.save(lead)

    await this.dataSource.transaction(async (manager) => {
      const leadRepository = manager.getRepository(Lead)
      const txLead = await leadRepository.findOne({
        where: { id: savedLead.id }
      })
      if (!txLead) throw new NotFoundException('Lead not found')

      await this.executeOnEnterAutomation(manager, txLead, column, new Date())
      await leadRepository.save(txLead)
    })

    return this.leadRepo.findOneOrFail({ where: { id: savedLead.id } })
  }

  async findOne(userId: string, id: string) {
    const lead = await this.leadRepo.findOne({ where: { id } })
    if (!lead) throw new NotFoundException('Lead not found')

    await this.assertBoardOwnership(userId, lead.boardId)
    return lead
  }

  async getLeadMessages(userId: string, leadId: string) {
    await this.findOne(userId, leadId)

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

  async sendLeadMessage(
    userId: string,
    leadId: string,
    body: { content: string }
  ) {
    const lead = await this.findOne(userId, leadId)
    const board = await this.boardRepo.findOne({ where: { id: lead.boardId } })

    if (!board) throw new NotFoundException('Board not found')

    const phoneNumberId = board.phoneNumberId ?? undefined

    if (!lead.phone?.trim()) {
      throw new BadRequestException('Lead phone is missing')
    }

    if (!board.boardPhone?.trim()) {
      throw new BadRequestException('Board phone is missing')
    }

    if (!phoneNumberId) {
      throw new BadRequestException('Board phoneNumberId is not configured')
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

  private async sendWhatsAppMessage(
    to: string,
    reply: string,
    phoneNumberId?: string
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
    const lead = await this.findOne(userId, id)
    let shouldRefreshLastActivityAt = false

    if (typeof dto.name !== 'undefined') lead.name = dto.name
    if (typeof dto.phone !== 'undefined') lead.phone = dto.phone
    if (typeof dto.email !== 'undefined') lead.email = dto.email
    if (typeof dto.source !== 'undefined') lead.source = dto.source
    if (typeof dto.companyName !== 'undefined') {
      lead.companyName = dto.companyName
    }
    if (typeof dto.notes !== 'undefined' && dto.notes !== lead.notes) {
      lead.notes = dto.notes
      shouldRefreshLastActivityAt = true
    }
    if (
      typeof dto.initialContext !== 'undefined' &&
      dto.initialContext !== lead.initialContext
    ) {
      lead.initialContext = dto.initialContext
      shouldRefreshLastActivityAt = true
    }
    if (
      typeof dto.temperature !== 'undefined' &&
      dto.temperature !== lead.temperature
    ) {
      lead.temperature = dto.temperature
      shouldRefreshLastActivityAt = true
    }
    if (typeof dto.outcome !== 'undefined' && dto.outcome !== lead.outcome) {
      lead.outcome = dto.outcome
      shouldRefreshLastActivityAt = true
    }
    if (typeof dto.state !== 'undefined' && dto.state !== lead.state) {
      lead.state = dto.state
      shouldRefreshLastActivityAt = true
    }

    if (shouldRefreshLastActivityAt) {
      lead.lastActivityAt = new Date()
    }

    return this.leadRepo.save(lead)
  }

  async moveLead(userId: string, leadId: string, dto: MoveLeadDto) {
    const { boardId, toColumnId, toPosition } = dto
    await this.assertBoardOwnership(userId, boardId)

    return this.dataSource.transaction(async (manager) => {
      const leadRepository = manager.getRepository(Lead)
      const columnRepository = manager.getRepository(BoardColumn)

      const lead = await leadRepository.findOne({
        where: { id: leadId, boardId }
      })
      if (!lead) throw new NotFoundException('Lead not found in this board')

      const toColumn = await columnRepository.findOne({
        where: { id: toColumnId, boardId }
      })
      if (!toColumn)
        throw new NotFoundException(
          'Destination column not found in this board'
        )

      const fromColumnId = lead.columnId
      const fromPosition = lead.position
      const safeToPosition = Math.max(0, toPosition)

      // mesma coluna (reorder)
      if (fromColumnId === toColumnId) {
        if (fromPosition === safeToPosition) return lead

        if (fromPosition < safeToPosition) {
          await leadRepository
            .createQueryBuilder()
            .update(Lead)
            .set({ position: () => '"position" - 1' })
            .where('"boardId" = :boardId', { boardId })
            .andWhere('"columnId" = :columnId', { columnId: toColumnId })
            .andWhere('"state" != :archivedState', {
              archivedState: LeadState.ARCHIVED
            })
            .andWhere(
              '"position" > :fromPosition AND "position" <= :toPosition',
              {
                fromPosition,
                toPosition: safeToPosition
              }
            )
            .execute()
        } else {
          await leadRepository
            .createQueryBuilder()
            .update(Lead)
            .set({ position: () => '"position" + 1' })
            .where('"boardId" = :boardId', { boardId })
            .andWhere('"columnId" = :columnId', { columnId: toColumnId })
            .andWhere('"state" != :archivedState', {
              archivedState: LeadState.ARCHIVED
            })
            .andWhere(
              '"position" >= :toPosition AND "position" < :fromPosition',
              {
                toPosition: safeToPosition,
                fromPosition
              }
            )
            .execute()
        }

        lead.position = safeToPosition
        lead.movedAt = new Date()
        return leadRepository.save(lead)
      }

      // muda de coluna
      // A) fecha buraco na origem
      await leadRepository
        .createQueryBuilder()
        .update(Lead)
        .set({ position: () => '"position" - 1' })
        .where('"boardId" = :boardId', { boardId })
        .andWhere('"columnId" = :fromColumnId', { fromColumnId })
        .andWhere('"state" != :archivedState', {
          archivedState: LeadState.ARCHIVED
        })
        .andWhere('"position" > :fromPosition', { fromPosition })
        .execute()

      // B) abre espaço no destino
      await leadRepository
        .createQueryBuilder()
        .update(Lead)
        .set({ position: () => '"position" + 1' })
        .where('"boardId" = :boardId', { boardId })
        .andWhere('"columnId" = :toColumnId', { toColumnId })
        .andWhere('"state" != :archivedState', {
          archivedState: LeadState.ARCHIVED
        })
        .andWhere('"position" >= :toPosition', { toPosition: safeToPosition })
        .execute()

      // C) move
      lead.columnId = toColumnId
      lead.position = safeToPosition
      lead.movedAt = new Date()
      lead.lastActivityAt = new Date()

      await this.executeOnEnterAutomation(manager, lead, toColumn, new Date())

      return leadRepository.save(lead)
    })
  }

  async archive(userId: string, id: string, state: LeadState) {
    const lead = await this.findOne(userId, id)
    lead.state = state
    return this.leadRepo.save(lead)
  }

  async toggleFavorite(userId: string, id: string, isFavorite: boolean) {
    const lead = await this.findOne(userId, id)
    lead.isFavorite = isFavorite
    return this.leadRepo.save(lead)
  }

  async updateRuntimeMode(
    userId: string,
    id: string,
    runtimeMode: LeadRuntimeMode
  ) {
    const lead = await this.findOne(userId, id)

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
    // soft delete padrão
    return this.archive(userId, id, LeadState.ARCHIVED)
  }

  async upsertFromWhatsapp(
    userId: string,
    dto: CreateLeadDto & { lastMessage?: string }
  ) {
    await this.assertBoardOwnership(userId, dto.boardId)

    // normaliza phone (opcional, mas ajuda)
    const phone = (dto.phone ?? '').trim()
    if (!phone) throw new BadRequestException('phone is required')

    // tenta achar lead existente no board pelo phone
    const existing = await this.leadRepo.findOne({
      where: {
        boardId: dto.boardId,
        phone,
        state: LeadState.ACTIVE
      }
    })

    // se existe -> atualiza movedAt + (opcional) name/email
    if (existing) {
      existing.movedAt = new Date()

      // opcional: atualiza nome se vier e for melhor que o atual
      if (dto.name && dto.name !== existing.name) existing.name = dto.name
      if (dto.email && dto.email !== existing.email) existing.email = dto.email
      if (dto.source && dto.source !== existing.source)
        existing.source = dto.source
      if (
        dto.initialContext &&
        dto.initialContext !== existing.initialContext
      ) {
        existing.initialContext = dto.initialContext
      }
      if (dto.temperature && dto.temperature !== existing.temperature) {
        existing.temperature = dto.temperature
      }
      if (dto.outcome !== undefined && dto.outcome !== existing.outcome) {
        existing.outcome = dto.outcome
      }
      if (dto.state && dto.state !== existing.state) {
        existing.state = dto.state
      }

      return this.leadRepo.save(existing)
    }

    // se não existe -> cria na coluna inicial (ou na dto.columnId se veio)
    const columnId = dto.columnId ?? (await this.getFirstColumnId(dto.boardId))

    const column = await this.columnRepo.findOne({
      where: { id: columnId, boardId: dto.boardId }
    })
    if (!column) throw new NotFoundException('Column not found in this board')

    const position = await this.getNextPosition(dto.boardId, columnId)

    const lead = this.leadRepo.create({
      boardId: dto.boardId,
      columnId,
      position,
      name: dto.name,
      phone,
      email: dto.email,
      source: dto.source ?? 'whatsapp',
      notes: dto.notes,
      initialContext: dto.initialContext ?? dto.lastMessage,
      temperature: dto.temperature ?? null,
      outcome: dto.outcome ?? null,
      state: dto.state ?? LeadState.ACTIVE,
      movedAt: new Date(),
      lastActivityAt: new Date()
    })
    const savedLead = await this.leadRepo.save(lead)

    await this.dataSource.transaction(async (manager) => {
      const leadRepository = manager.getRepository(Lead)
      const txLead = await leadRepository.findOne({
        where: { id: savedLead.id }
      })
      if (!txLead) throw new NotFoundException('Lead not found')

      await this.executeOnEnterAutomation(manager, txLead, column, new Date())
      await leadRepository.save(txLead)
    })

    return this.leadRepo.findOneOrFail({ where: { id: savedLead.id } })
  }
}

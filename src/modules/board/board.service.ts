import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import { LeadFollowUp } from '../leads/entities/lead-followup.entity'
import { Lead } from '../leads/entities/lead.entity'

import { CreateBoardDto } from './dtos/create-board.dto'
import { BoardColumn } from './entities/board-column.entity'
import { Board } from './entities/board.entity'

type FollowUpBoardStatus = 'none' | 'scheduled' | 'today' | 'overdue'

type LeadFollowUpSummary = {
  openCount: number
  nextFollowUpValue: string | null
  nextDueAt: Date | null
  status: FollowUpBoardStatus
}

type LeadWithFollowUpSummary = Lead & {
  followUpSummary: LeadFollowUpSummary
}

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnRepo: Repository<BoardColumn>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(LeadFollowUp)
    private readonly followUpRepo: Repository<LeadFollowUp>,
    private readonly dataSource: DataSource
  ) {}

  private defaultColumns() {
    return [
      { name: 'Novo Lead', position: 0 },
      { name: 'Contato Inicial', position: 1 },
      { name: 'Negociação', position: 2 },
      { name: 'Fechado', position: 3 }
    ]
  }

  async create(userId: string, dto: CreateBoardDto) {
    return this.dataSource.transaction(async (manager) => {
      const boardRepository = manager.getRepository(Board)
      const columnRepository = manager.getRepository(BoardColumn)

      const board = boardRepository.create({
        name: dto.name.trim(),
        boardPhone: dto.boardPhone.trim(),
        userId,
        isActive: true,
        isArchived: false
      })

      const savedBoard = await boardRepository.save(board)

      const defaultColumns = this.defaultColumns().map((column) =>
        columnRepository.create({
          boardId: savedBoard.id,
          name: column.name,
          position: column.position,
          isDefault: true,
          onEnter: null
        })
      )

      await columnRepository.save(defaultColumns)

      return savedBoard
    })
  }

  async findOne(userId: string, boardId: string) {
    const board = await this.boardRepo.findOne({ where: { id: boardId } })
    if (!board) throw new NotFoundException('Board not found')
    if (board.userId !== userId)
      throw new ForbiddenException('Board does not belong to user')
    return board
  }

  async findAllByUser(userId: string): Promise<Board[]> {
    return this.boardRepo.find({
      where: { userId, isArchived: false },
      order: { createdAt: 'ASC' }
    })
  }

  private buildLeadFollowUpSummary(
    openFollowUps: LeadFollowUp[]
  ): LeadFollowUpSummary {
    const nextFollowUp = openFollowUps[0] ?? null

    if (!nextFollowUp) {
      return {
        openCount: 0,
        nextFollowUpValue: null,
        nextDueAt: null,
        status: 'none'
      }
    }

    const now = new Date()

    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const dueAt = new Date(nextFollowUp.dueAt)

    let status: FollowUpBoardStatus = 'scheduled'

    if (dueAt < startOfToday) {
      status = 'overdue'
    } else if (dueAt >= startOfToday && dueAt <= endOfToday) {
      status = 'today'
    } else {
      status = 'scheduled'
    }

    return {
      openCount: openFollowUps.length,
      nextFollowUpValue: nextFollowUp.value,
      nextDueAt: nextFollowUp.dueAt,
      status
    }
  }

  /**
   * Retorna:
   * - board
   * - columns ordenadas
   * - (opcional) leads dentro de cada coluna (quando Lead relations estiverem prontas)
   *
   * Por enquanto, já deixa o shape pronto pro front:
   * { board, columns: [{... , leads: []}] }
   */
  async findFull(userId: string, boardId: string) {
    const board = await this.findOne(userId, boardId)

    const columns = await this.columnRepo.find({
      where: { boardId: board.id },
      order: { position: 'ASC', createdAt: 'ASC' }
    })

    const leads = await this.leadRepo.find({
      where: { boardId: board.id },
      order: { columnId: 'ASC', position: 'ASC', createdAt: 'ASC' }
    })

    const leadIds = leads.map((lead) => lead.id)

    const openFollowUpsByLeadId = new Map<string, LeadFollowUp[]>()

    if (leadIds.length > 0) {
      const openFollowUps = await this.followUpRepo
        .createQueryBuilder('f')
        .where('f.leadId IN (:...leadIds)', { leadIds })
        .andWhere('f.status = :status', { status: 'pending' })
        .orderBy('f.dueAt', 'ASC')
        .addOrderBy('f.createdAt', 'ASC')
        .getMany()

      for (const followUp of openFollowUps) {
        const arr = openFollowUpsByLeadId.get(followUp.leadId) ?? []
        arr.push(followUp)
        openFollowUpsByLeadId.set(followUp.leadId, arr)
      }
    }

    const leadsWithSummary: LeadWithFollowUpSummary[] = leads.map((lead) => {
      const openFollowUps = openFollowUpsByLeadId.get(lead.id) ?? []
      const followUpSummary = this.buildLeadFollowUpSummary(openFollowUps)

      return {
        ...lead,
        followUpSummary
      }
    })

    const leadsByColumn = new Map<string, LeadWithFollowUpSummary[]>()

    for (const lead of leadsWithSummary) {
      const arr = leadsByColumn.get(lead.columnId) ?? []
      arr.push(lead)
      leadsByColumn.set(lead.columnId, arr)
    }

    return {
      board,
      columns: columns.map((column) => ({
        ...column,
        leads: leadsByColumn.get(column.id) ?? []
      }))
    }
  }
}

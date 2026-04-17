import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import { Lead, LeadState } from '../leads/entities/lead.entity'

import { CreateColumnDto } from './dtos/create-column.dto'
import { UpdateColumnDto } from './dtos/update-column.dto'
import { BoardColumn } from './entities/board-column.entity'
import { Board } from './entities/board.entity'

@Injectable()
export class BoardColumnsService {
  constructor(
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnRepo: Repository<BoardColumn>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    private readonly dataSource: DataSource
  ) {}

  private async assertBoardOwnership(userId: string, boardId: string) {
    const board = await this.boardRepo.findOne({ where: { id: boardId } })
    if (!board) throw new NotFoundException('Board not found')
    if (board.userId !== userId)
      throw new ForbiddenException('Board does not belong to user')
    return board
  }

  async create(userId: string, boardId: string, dto: CreateColumnDto) {
    await this.assertBoardOwnership(userId, boardId)

    return this.dataSource.transaction(async (manager) => {
      const columnRepository = manager.getRepository(BoardColumn)

      const existing = await columnRepository.find({
        where: { boardId },
        order: { position: 'ASC' }
      })

      const insertPos =
        typeof dto.position === 'number'
          ? Math.min(Math.max(dto.position, 0), existing.length)
          : existing.length

      // abre espaço (shift +1) a partir do insertPos
      await columnRepository
        .createQueryBuilder()
        .update(BoardColumn)
        .set({ position: () => '"position" + 1' })
        .where('"boardId" = :boardId', { boardId })
        .andWhere('"position" >= :insertPos', { insertPos })
        .execute()

      const column = columnRepository.create({
        boardId,
        name: dto.name,
        position: insertPos,
        isDefault: false,
        onEnter: dto.onEnter
      })

      return columnRepository.save(column)
    })
  }

  async update(
    userId: string,
    boardId: string,
    columnId: string,
    dto: UpdateColumnDto
  ) {
    await this.assertBoardOwnership(userId, boardId)

    const column = await this.columnRepo.findOne({
      where: { id: columnId, boardId }
    })
    if (!column) throw new NotFoundException('Column not found')

    if (typeof dto.name !== 'undefined') column.name = dto.name
    if (typeof dto.onEnter !== 'undefined') column.onEnter = dto.onEnter

    return this.columnRepo.save(column)
  }

  async remove(userId: string, boardId: string, columnId: string) {
    await this.assertBoardOwnership(userId, boardId)

    return this.dataSource.transaction(async (manager) => {
      const columnRepository = manager.getRepository(BoardColumn)

      const count = await this.leadRepo.count({
        where: { boardId, columnId, state: LeadState.ACTIVE }
      })

      if (count > 0) {
        throw new BadRequestException('Cannot delete column with leads')
      }

      const col = await columnRepository.findOne({
        where: { id: columnId, boardId }
      })
      if (!col) throw new NotFoundException('Column not found')

      const removedPos = col.position
      await columnRepository.delete({ id: columnId, boardId })

      // fecha o “buraco”
      await columnRepository
        .createQueryBuilder()
        .update(BoardColumn)
        .set({ position: () => '"position" - 1' })
        .where('"boardId" = :boardId', { boardId })
        .andWhere('"position" > :removedPos', { removedPos })
        .execute()

      return { ok: true }
    })
  }
}

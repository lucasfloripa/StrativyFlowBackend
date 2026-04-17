import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Board } from '../board/entities/board.entity'

import { CreateLeadFollowUpDto } from './dtos/create-lead-followup.dto'
import { UpdateLeadFollowUpDto } from './dtos/update-lead-followup.dto'
import { LeadFollowUp } from './entities/lead-followup.entity'
import { Lead, LeadState } from './entities/lead.entity'

@Injectable()
export class LeadFollowUpsService {
  constructor(
    @InjectRepository(LeadFollowUp)
    private readonly followUpRepo: Repository<LeadFollowUp>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>
  ) {}

  private async assertBoardOwnership(userId: string, boardId: string) {
    const board = await this.boardRepo.findOne({ where: { id: boardId } })
    if (!board) throw new NotFoundException('Board not found')

    if (board.userId !== userId)
      throw new ForbiddenException('Board does not belong to user')

    if (board.isArchived) throw new BadRequestException('Board is archived')

    return board
  }

  private async findLeadOrFail(userId: string, leadId: string) {
    const lead = await this.leadRepo.findOne({
      where: { id: leadId }
    })

    if (!lead) throw new NotFoundException('Lead not found')

    await this.assertBoardOwnership(userId, lead.boardId)

    return lead
  }

  private async findFollowUpOrFail(userId: string, id: string) {
    const followUp = await this.followUpRepo.findOne({
      where: { id },
      relations: { lead: true }
    })

    if (!followUp) throw new NotFoundException('Follow-up not found')

    await this.assertBoardOwnership(userId, followUp.lead.boardId)

    return followUp
  }

  private async touchLeadActivity(leadId: string, activityAt: Date) {
    await this.leadRepo.update(leadId, {
      lastActivityAt: activityAt
    })
  }

  async create(userId: string, dto: CreateLeadFollowUpDto) {
    const lead = await this.findLeadOrFail(userId, dto.leadId)

    const followUp = this.followUpRepo.create({
      leadId: lead.id,
      value: dto.value,
      dueAt: new Date(dto.dueAt),
      status: 'pending',
      completedAt: null
    })

    const savedFollowUp = await this.followUpRepo.save(followUp)

    await this.touchLeadActivity(lead.id, savedFollowUp.createdAt)

    return savedFollowUp
  }

  async listByLead(userId: string, leadId: string) {
    const lead = await this.findLeadOrFail(userId, leadId)

    return this.followUpRepo.find({
      where: { leadId: lead.id },
      order: { dueAt: 'ASC', createdAt: 'ASC' }
    })
  }

  async update(userId: string, id: string, dto: UpdateLeadFollowUpDto) {
    const followUp = await this.findFollowUpOrFail(userId, id)

    if (dto.value !== undefined) followUp.value = dto.value
    if (dto.dueAt !== undefined) followUp.dueAt = new Date(dto.dueAt)

    if (dto.status !== undefined) {
      followUp.status = dto.status

      if (dto.status === 'done') {
        followUp.completedAt = new Date()
      }

      if (dto.status === 'pending' || dto.status === 'canceled') {
        followUp.completedAt = null
      }
    }

    const savedFollowUp = await this.followUpRepo.save(followUp)
    const activityAt = savedFollowUp.completedAt ?? savedFollowUp.updatedAt

    await this.touchLeadActivity(savedFollowUp.leadId, activityAt)

    return savedFollowUp
  }

  async complete(userId: string, id: string) {
    const followUp = await this.findFollowUpOrFail(userId, id)
    const completedAt = new Date()

    followUp.status = 'done'
    followUp.completedAt = completedAt

    const savedFollowUp = await this.followUpRepo.save(followUp)

    await this.touchLeadActivity(savedFollowUp.leadId, completedAt)

    return savedFollowUp
  }

  async remove(userId: string, id: string) {
    const followUp = await this.findFollowUpOrFail(userId, id)

    await this.followUpRepo.delete(followUp.id)
    await this.touchLeadActivity(followUp.leadId, new Date())

    return { success: true }
  }
}

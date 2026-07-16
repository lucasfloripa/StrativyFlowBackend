import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import { FollowUp } from '../entities/followup.entity'

@Injectable()
export class FollowUpService {
  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  async create(dto: CreateFollowUpDto): Promise<FollowUp> {
    const followUp = this.followUpRepository.create({
      negotiationId: dto.negotiationId,
      value: dto.value,
      dueAt: new Date(dto.dueAt),
      status: dto.status,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      reminder1hSentAt: null
    })

    return await this.followUpRepository.save(followUp)
  }

  async findAll(): Promise<FollowUp[]> {
    return await this.followUpRepository.find({
      order: { createdAt: 'DESC' }
    })
  }

  async findOne(id: string): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({ where: { id } })

    if (!followUp) {
      throw new NotFoundException(`FollowUp ${id} not found`)
    }

    return followUp
  }

  async update(id: string, dto: UpdateFollowUpDto): Promise<FollowUp> {
    const followUp = await this.findOne(id)

    followUp.reminder1hSentAt = null

    if (dto.negotiationId !== undefined) {
      followUp.negotiationId = dto.negotiationId
    }

    if (dto.value !== undefined) {
      followUp.value = dto.value
    }

    if (dto.dueAt !== undefined) {
      followUp.dueAt = new Date(dto.dueAt)
    }

    if (dto.status !== undefined) {
      followUp.status = dto.status
    }

    if (dto.completedAt !== undefined) {
      followUp.completedAt = dto.completedAt ? new Date(dto.completedAt) : null
    }

    return await this.followUpRepository.save(followUp)
  }

  async remove(id: string): Promise<FollowUp> {
    const followUp = await this.findOne(id)

    await this.followUpRepository.remove(followUp)

    return followUp
  }
}

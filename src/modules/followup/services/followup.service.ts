import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { FollowUpResponseDto } from '../dto/followup-response.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import { FollowUp } from '../entities/followup.entity'
import { mapFollowUpToResponseDto } from '../mappers/followup-response.mapper'

@Injectable()
export class FollowUpService {
  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  async create(dto: CreateFollowUpDto): Promise<FollowUpResponseDto> {
    const followUp = this.followUpRepository.create({
      negotiationId: dto.negotiationId,
      title: dto.title,
      templateId: dto.templateId ?? null,
      templateVariables: dto.templateVariables ?? {},
      dueAt: new Date(dto.dueAt),
      status: dto.status,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      reminder1hSentAt: null
    })

    const savedFollowUp = await this.followUpRepository.save(followUp)
    const reloadedFollowUp = await this.findEntityById(savedFollowUp.id)

    return mapFollowUpToResponseDto(reloadedFollowUp)
  }

  async findAll(): Promise<FollowUpResponseDto[]> {
    const followUps = await this.followUpRepository.find({
      relations: {
        template: true
      },
      order: { createdAt: 'DESC' }
    })

    return followUps.map(mapFollowUpToResponseDto)
  }

  async findOne(id: string): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    return mapFollowUpToResponseDto(followUp)
  }

  private async findEntityById(id: string): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({
      where: { id },
      relations: {
        template: true
      }
    })

    if (!followUp) {
      throw new NotFoundException(`FollowUp ${id} not found`)
    }

    return followUp
  }

  async update(id: string, dto: UpdateFollowUpDto): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    followUp.reminder1hSentAt = null

    if (dto.negotiationId !== undefined) {
      followUp.negotiationId = dto.negotiationId
    }

    if (dto.title !== undefined) {
      followUp.title = dto.title
    }

    if (dto.templateId !== undefined) {
      followUp.templateId = dto.templateId ?? null
    }

    if (dto.templateVariables !== undefined) {
      followUp.templateVariables = dto.templateVariables ?? {}
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

    const savedFollowUp = await this.followUpRepository.save(followUp)
    const reloadedFollowUp = await this.findEntityById(savedFollowUp.id)

    return mapFollowUpToResponseDto(reloadedFollowUp)
  }

  async remove(id: string): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    await this.followUpRepository.remove(followUp)

    return mapFollowUpToResponseDto(followUp)
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { FollowUpResponseDto } from '../dto/followup-response.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import { FollowUpAction } from '../entities/followup-action.entity'
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
      dueAt: new Date(dto.dueAt),
      status: dto.status,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      reminder1hSentAt: null,
      actions: (dto.actions ?? []).map((action) =>
        this.followUpRepository.manager.create(FollowUpAction, {
          type: action.type,
          channel: action.channel ?? null,
          status: action.status,
          payload: action.payload ?? null,
          executedAt: action.executedAt ? new Date(action.executedAt) : null,
          failureReason: action.failureReason ?? null
        })
      )
    })

    const savedFollowUp = await this.followUpRepository.save(followUp)
    const reloadedFollowUp = await this.findEntityById(savedFollowUp.id)

    return mapFollowUpToResponseDto(reloadedFollowUp)
  }

  async findAll(): Promise<FollowUpResponseDto[]> {
    const followUps = await this.followUpRepository.find({
      relations: {
        actions: true
      },
      order: { createdAt: 'DESC' }
    })

    return followUps.map(mapFollowUpToResponseDto)
  }

  async findOne(id: string): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    return mapFollowUpToResponseDto(followUp)
  }

  private async findEntityById(
    id: string,
    manager?: EntityManager
  ): Promise<FollowUp> {
    const repository = manager
      ? manager.getRepository(FollowUp)
      : this.followUpRepository
    const followUp = await repository.findOne({
      where: { id },
      relations: {
        actions: true
      }
    })

    if (!followUp) {
      throw new NotFoundException(`FollowUp ${id} not found`)
    }

    return followUp
  }

  async update(
    id: string,
    dto: UpdateFollowUpDto
  ): Promise<FollowUpResponseDto> {
    return await this.followUpRepository.manager.transaction(
      async (manager) => {
        const followUp = await this.findEntityById(id, manager)

        followUp.reminder1hSentAt = null

        if (dto.negotiationId !== undefined) {
          followUp.negotiationId = dto.negotiationId
        }

        if (dto.title !== undefined) {
          followUp.title = dto.title
        }

        if (dto.dueAt !== undefined) {
          followUp.dueAt = new Date(dto.dueAt)
        }

        if (dto.status !== undefined) {
          followUp.status = dto.status
        }

        if (dto.completedAt !== undefined) {
          followUp.completedAt = dto.completedAt
            ? new Date(dto.completedAt)
            : null
        }

        if (dto.actions !== undefined) {
          await manager.delete(FollowUpAction, { followUpId: followUp.id })
          followUp.actions = dto.actions.map((action) =>
            manager.create(FollowUpAction, {
              followUpId: followUp.id,
              type: action.type,
              channel: action.channel ?? null,
              status: action.status,
              payload: action.payload ?? null,
              executedAt: action.executedAt
                ? new Date(action.executedAt)
                : null,
              failureReason: action.failureReason ?? null
            })
          )
        }

        const savedFollowUp = await manager.save(FollowUp, followUp)
        const reloadedFollowUp = await this.findEntityById(
          savedFollowUp.id,
          manager
        )

        return mapFollowUpToResponseDto(reloadedFollowUp)
      }
    )
  }

  async remove(id: string): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    await this.followUpRepository.remove(followUp)

    return mapFollowUpToResponseDto(followUp)
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'

import { CreateNegotiationDto } from './dto/create-negotiation.dto'
import { NegotiationNoteDto } from './dto/negotiation-note.dto'
import { UpdateNegotiationDto } from './dto/update-negotiation.dto'
import { Negotiation, NegotiationNote } from './entities/negotiation.entity'

@Injectable()
export class NegotiationService {
  constructor(
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  private createFollowUpDueDate(baseDate: Date, hoursToAdd: number): Date {
    return new Date(baseDate.getTime() + hoursToAdd * 60 * 60 * 1000)
  }

  private buildDefaultFollowUps(negotiationId: string, createdAt: Date): FollowUp[] {
    const followUpConfigs = [
      {
        title: 'Primeiro contato',
        description: 'Retomar contato inicial com o lead.',
        hoursToAdd: 24
      },
      {
        title: 'Entender objeções',
        description: 'Mapear dúvidas e objeções do lead.',
        hoursToAdd: 72
      },
      {
        title: 'Reforçar valor',
        description: 'Reforçar os principais benefícios da proposta.',
        hoursToAdd: 24 * 7
      },
      {
        title: 'Última tentativa',
        description: 'Realizar última tentativa de avanço da negociação.',
        hoursToAdd: 24 * 14
      }
    ]

    return followUpConfigs.map((followUpConfig) =>
      this.followUpRepository.create({
        negotiationId,
        title: followUpConfig.title,
        description: followUpConfig.description,
        templateId: null,
        templateVariables: {},
        dueAt: this.createFollowUpDueDate(createdAt, followUpConfig.hoursToAdd),
        status: FollowUpStatus.PENDING,
        completedAt: null,
        reminder1hSentAt: null
      })
    )
  }

  private normalizeNoteCreatedAt(value?: string): string {
    if (value) {
      const parsedDate = new Date(value)

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString()
      }
    }

    return new Date().toISOString()
  }

  private normalizeNotes(
    notes: NegotiationNoteDto[] | undefined
  ): NegotiationNote[] | undefined {
    if (typeof notes === 'undefined') {
      return undefined
    }

    return notes.map((note) => ({
      title: note.title.trim(),
      description: note.description.trim(),
      createdAt: this.normalizeNoteCreatedAt(note.createdAt)
    }))
  }

  async create(dto: CreateNegotiationDto): Promise<Negotiation> {
    const normalizedNotes = this.normalizeNotes(dto.notes)

    return await this.negotiationRepository.manager.transaction(async (manager) => {
      const negotiation = manager.create(Negotiation, {
        leadId: dto.leadId,
        title: dto.title,
        stage: dto.stage,
        temperature: dto.temperature,
        negotiationType: dto.negotiationType,
        value: dto.value,
        notes: normalizedNotes,
        closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        stageUpdatedAt: dto.stageUpdatedAt ? new Date(dto.stageUpdatedAt) : null
      })

      const createdNegotiation = await manager.save(Negotiation, negotiation)
      const defaultFollowUps = this.buildDefaultFollowUps(
        createdNegotiation.id,
        createdNegotiation.createdAt ?? new Date()
      )

      await manager.save(FollowUp, defaultFollowUps)

      return createdNegotiation
    })
  }

  async findAll(): Promise<Negotiation[]> {
    return await this.negotiationRepository.find({
      order: { createdAt: 'DESC' }
    })
  }

  async findOne(id: string): Promise<Negotiation> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id }
    })

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${id} not found`)
    }

    return negotiation
  }

  async update(
    id: string,
    dto: UpdateNegotiationDto
  ): Promise<Negotiation> {
    const negotiation = await this.findOne(id)

    if (dto.leadId !== undefined) {
      negotiation.leadId = dto.leadId
    }

    if (dto.title !== undefined) {
      negotiation.title = dto.title
    }

    if (dto.stage !== undefined) {
      negotiation.stage = dto.stage
    }

    if (dto.temperature !== undefined) {
      negotiation.temperature = dto.temperature
    }

    if (dto.negotiationType !== undefined) {
      negotiation.negotiationType = dto.negotiationType
    }

    if (dto.value !== undefined) {
      negotiation.value = dto.value
    }

    if (dto.notes !== undefined) {
      negotiation.notes = this.normalizeNotes(dto.notes)
    }

    if (dto.closedAt !== undefined) {
      negotiation.closedAt = dto.closedAt ? new Date(dto.closedAt) : null
    }

    if (dto.stageUpdatedAt !== undefined) {
      negotiation.stageUpdatedAt = dto.stageUpdatedAt
        ? new Date(dto.stageUpdatedAt)
        : null
    }

    return await this.negotiationRepository.save(negotiation)
  }

  async remove(id: string): Promise<Negotiation> {
    const negotiation = await this.findOne(id)

    await this.negotiationRepository.remove(negotiation)

    return negotiation
  }
}
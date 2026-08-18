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
    const negotiation = this.negotiationRepository.create({
      leadId: dto.leadId,
      title: dto.title,
      stage: dto.stage,
      temperature: dto.temperature,
      negotiationType: dto.negotiationType,
      value: dto.value,
      notes: normalizedNotes,
      closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
      stageUpdatedAt: dto.stageUpdatedAt
        ? new Date(dto.stageUpdatedAt)
        : null
    })

    return await this.negotiationRepository.save(negotiation)
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

  async update(id: string, dto: UpdateNegotiationDto): Promise<Negotiation> {
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

    const savedNegotiation = await this.negotiationRepository.save(negotiation)

    // When closing a negotiation, mark all pending follow-ups as done
    const isBeingClosed = dto.closedAt != null
    if (isBeingClosed) {
      await this.followUpRepository.update(
        { negotiationId: id, status: FollowUpStatus.PENDING },
        { status: FollowUpStatus.DONE, completedAt: new Date() }
      )
    }

    return savedNegotiation
  }

  async remove(id: string): Promise<Negotiation> {
    const negotiation = await this.findOne(id)

    await this.negotiationRepository.remove(negotiation)

    return negotiation
  }
}

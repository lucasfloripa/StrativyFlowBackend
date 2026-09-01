import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'

import { CreateNegotiationDto } from './dto/create-negotiation.dto'
import { NegotiationNoteDto } from './dto/negotiation-note.dto'
import { UpdateNegotiationDto } from './dto/update-negotiation.dto'
import {
  Negotiation,
  NegotiationNote,
  NegotiationStage,
  NegotiationStatus
} from './entities/negotiation.entity'

const getNegotiationStatus = (stage: NegotiationStage): NegotiationStatus => {
  if (stage === NegotiationStage.WON) {
    return NegotiationStatus.WON
  }

  if (stage === NegotiationStage.LOST) {
    return NegotiationStatus.LOST
  }

  return NegotiationStatus.OPEN
}

const getNegotiationStage = (status: NegotiationStatus): NegotiationStage => {
  if (status === NegotiationStatus.WON) {
    return NegotiationStage.WON
  }

  if (status === NegotiationStatus.LOST) {
    return NegotiationStage.LOST
  }

  return NegotiationStage.NEW
}

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
    const stage =
      dto.stage ??
      (dto.status ? getNegotiationStage(dto.status) : NegotiationStage.NEW)
    const status = getNegotiationStatus(stage)
    const negotiation = this.negotiationRepository.create({
      leadId: dto.leadId,
      title: dto.title,
      stage,
      status,
      temperature: dto.temperature,
      negotiationType: dto.negotiationType,
      notes: normalizedNotes,
      closedAt: dto.closedAt
        ? new Date(dto.closedAt)
        : status === NegotiationStatus.OPEN
          ? null
          : new Date(),
      stageUpdatedAt: dto.stageUpdatedAt ? new Date(dto.stageUpdatedAt) : null
    })

    return await this.negotiationRepository.save(negotiation)
  }

  async findAll(leadId?: string): Promise<Negotiation[]> {
    return await this.negotiationRepository.find({
      where: leadId ? { leadId } : undefined,
      relations: {
        financial: {
          costs: true,
          payments: true
        }
      },
      order: { createdAt: 'DESC' }
    })
  }

  async findOne(id: string): Promise<Negotiation> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id },
      relations: { financial: true }
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
      negotiation.status = getNegotiationStatus(dto.stage)
    } else if (dto.status !== undefined) {
      negotiation.status = dto.status
      negotiation.stage = getNegotiationStage(dto.status)
    }

    if (dto.temperature !== undefined) {
      negotiation.temperature = dto.temperature
    }

    if (dto.negotiationType !== undefined) {
      negotiation.negotiationType = dto.negotiationType
    }

    if (dto.notes !== undefined) {
      negotiation.notes = this.normalizeNotes(dto.notes)
    }

    if (dto.closedAt !== undefined) {
      negotiation.closedAt = dto.closedAt ? new Date(dto.closedAt) : null
    }

    if (dto.stage !== undefined || dto.status !== undefined) {
      if (negotiation.status === NegotiationStatus.OPEN) {
        negotiation.closedAt = null
      } else if (!negotiation.closedAt) {
        negotiation.closedAt = new Date()
      }
    }

    if (dto.stageUpdatedAt !== undefined) {
      negotiation.stageUpdatedAt = dto.stageUpdatedAt
        ? new Date(dto.stageUpdatedAt)
        : null
    }

    const savedNegotiation = await this.negotiationRepository.save(negotiation)

    // When closing a negotiation, mark all pending follow-ups as done
    const isBeingClosed =
      negotiation.status === NegotiationStatus.WON ||
      negotiation.status === NegotiationStatus.LOST
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

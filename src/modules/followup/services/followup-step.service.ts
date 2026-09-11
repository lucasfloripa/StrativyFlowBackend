import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  CreateFollowUpStepTreeDto,
  CreateFollowUpStepTreeItemDto
} from '../dto/create-followup-step-tree.dto'
import { CreateFollowUpStepDto } from '../dto/create-followup-step.dto'
import { FollowUpStepResponseDto } from '../dto/followup-response.dto'
import { UpdateFollowUpStepDto } from '../dto/update-followup-step.dto'
import {
  FollowUpActionType,
  FollowUpStep,
  FollowUpStepStatus,
  FollowUpStepType
} from '../entities/followup-step.entity'
import { FollowUp } from '../entities/followup.entity'
import { mapFollowUpStepToResponseDto } from '../mappers/followup-response.mapper'
import { resolveFollowUpStepScheduledAt } from '../utils/followup-step-schedule'

@Injectable()
export class FollowUpStepService {
  constructor(
    @InjectRepository(FollowUpStep)
    private readonly followUpStepRepository: Repository<FollowUpStep>,
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  async create(dto: CreateFollowUpStepDto): Promise<FollowUpStepResponseDto> {
    const followUp = await this.findFollowUpById(dto.followUpId)
    await this.ensureParentBelongsToFollowUp(dto.parentId, dto.followUpId)

    const step = this.followUpStepRepository.create({
      followUpId: dto.followUpId,
      parentId: dto.parentId ?? null,
      type: dto.type,
      actionType: dto.actionType ?? null,
      conditionType: dto.conditionType ?? null,
      channel: dto.channel ?? null,
      status: FollowUpStepStatus.PENDING,
      waitTime:
        dto.type === FollowUpStepType.CONDITION ? null : (dto.waitTime ?? null),
      waitUnit:
        dto.type === FollowUpStepType.CONDITION ? null : (dto.waitUnit ?? null),
      scheduledAt: resolveFollowUpStepScheduledAt(
        followUp.dueAt,
        dto.type,
        dto.parentId,
        dto.waitTime,
        dto.waitUnit
      ),
      payload: dto.payload ?? null
    })

    return mapFollowUpStepToResponseDto(
      await this.followUpStepRepository.save(step)
    )
  }

  async createTree(dto: CreateFollowUpStepTreeDto): Promise<{
    followUpId: string
    steps: Array<{ clientId: string; step: FollowUpStepResponseDto }>
  }> {
    return await this.followUpStepRepository.manager.transaction(
      async (manager) => {
        const followUpRepository = manager.getRepository(FollowUp)
        const stepRepository = manager.getRepository(FollowUpStep)

        const followUp = await followUpRepository.findOne({
          where: { id: dto.followUpId },
          relations: { steps: true }
        })
        if (!followUp) {
          throw new NotFoundException(`FollowUp ${dto.followUpId} not found`)
        }

        const primaryStep = this.findPrimaryStep(followUp.steps ?? [])
        if (!primaryStep) {
          throw new BadRequestException(
            `FollowUp ${dto.followUpId} primary step not found`
          )
        }

        const stepsByClientId = new Map<string, CreateFollowUpStepTreeItemDto>()

        for (const step of dto.steps) {
          if (stepsByClientId.has(step.clientId)) {
            throw new BadRequestException(
              `Duplicate FollowUpStep clientId ${step.clientId}`
            )
          }
          stepsByClientId.set(step.clientId, step)
        }

        for (const step of dto.steps) {
          if (
            step.parentClientId &&
            !stepsByClientId.has(step.parentClientId)
          ) {
            throw new BadRequestException(
              `FollowUpStep parentClientId ${step.parentClientId} not found`
            )
          }
        }

        const pendingSteps = new Map(stepsByClientId)
        const persistedIds = new Map<string, string>()
        const responseSteps: Array<{
          clientId: string
          step: FollowUpStepResponseDto
        }> = []

        while (pendingSteps.size > 0) {
          const readySteps = [...pendingSteps.values()].filter(
            (step) =>
              !step.parentClientId || persistedIds.has(step.parentClientId)
          )

          if (readySteps.length === 0) {
            throw new BadRequestException('FollowUpStep tree contains a cycle')
          }

          for (const stepDto of readySteps) {
            const step = stepRepository.create({
              followUpId: dto.followUpId,
              parentId: stepDto.parentClientId
                ? (persistedIds.get(stepDto.parentClientId) ?? null)
                : primaryStep.id,
              type: stepDto.type,
              actionType: stepDto.actionType ?? null,
              conditionType: stepDto.conditionType ?? null,
              channel: stepDto.channel ?? null,
              status: FollowUpStepStatus.PENDING,
              waitTime:
                stepDto.type === FollowUpStepType.CONDITION
                  ? null
                  : (stepDto.waitTime ?? null),
              waitUnit:
                stepDto.type === FollowUpStepType.CONDITION
                  ? null
                  : (stepDto.waitUnit ?? null),
              scheduledAt: resolveFollowUpStepScheduledAt(
                followUp.dueAt,
                stepDto.type,
                stepDto.parentClientId,
                stepDto.waitTime,
                stepDto.waitUnit
              ),
              payload: stepDto.payload ?? null
            })
            const savedStep = await stepRepository.save(step)

            persistedIds.set(stepDto.clientId, savedStep.id)
            pendingSteps.delete(stepDto.clientId)
            responseSteps.push({
              clientId: stepDto.clientId,
              step: mapFollowUpStepToResponseDto(savedStep)
            })
          }
        }

        return { followUpId: dto.followUpId, steps: responseSteps }
      }
    )
  }

  async findAll(followUpId?: string): Promise<FollowUpStepResponseDto[]> {
    const steps = await this.followUpStepRepository.find({
      where: followUpId ? { followUpId } : undefined,
      order: { createdAt: 'ASC' }
    })

    return steps.map(mapFollowUpStepToResponseDto)
  }

  async findOne(id: string): Promise<FollowUpStepResponseDto> {
    return mapFollowUpStepToResponseDto(await this.findEntityById(id))
  }

  async update(
    id: string,
    dto: UpdateFollowUpStepDto
  ): Promise<FollowUpStepResponseDto> {
    const step = await this.findEntityById(id)
    const followUpId = dto.followUpId ?? step.followUpId
    const followUp = await this.findFollowUpById(followUpId)

    if (dto.followUpId !== undefined) {
      step.followUpId = dto.followUpId
    }

    if (dto.parentId !== undefined || dto.followUpId !== undefined) {
      await this.ensureParentBelongsToFollowUp(
        dto.parentId === undefined ? step.parentId : dto.parentId,
        followUpId,
        step.id
      )
    }

    if (dto.parentId !== undefined) step.parentId = dto.parentId
    if (dto.type !== undefined) step.type = dto.type
    if (dto.actionType !== undefined) step.actionType = dto.actionType
    if (dto.conditionType !== undefined) step.conditionType = dto.conditionType
    if (dto.channel !== undefined) step.channel = dto.channel
    if (dto.waitTime !== undefined) step.waitTime = dto.waitTime
    if (dto.waitUnit !== undefined) step.waitUnit = dto.waitUnit
    if (dto.payload !== undefined) step.payload = dto.payload

    if (step.type === FollowUpStepType.CONDITION) {
      step.waitTime = null
      step.waitUnit = null
    }

    if (
      dto.followUpId !== undefined ||
      dto.parentId !== undefined ||
      dto.type !== undefined ||
      dto.waitTime !== undefined ||
      dto.waitUnit !== undefined
    ) {
      step.scheduledAt = resolveFollowUpStepScheduledAt(
        followUp.dueAt,
        step.type,
        step.parentId,
        step.waitTime,
        step.waitUnit
      )
    }

    return mapFollowUpStepToResponseDto(
      await this.followUpStepRepository.save(step)
    )
  }

  async remove(id: string): Promise<FollowUpStepResponseDto> {
    const step = await this.findEntityById(id)
    await this.followUpStepRepository.remove(step)
    return mapFollowUpStepToResponseDto(step)
  }

  private async findEntityById(id: string): Promise<FollowUpStep> {
    const step = await this.followUpStepRepository.findOne({ where: { id } })

    if (!step) {
      throw new NotFoundException(`FollowUpStep ${id} not found`)
    }

    return step
  }

  private findPrimaryStep(steps: FollowUpStep[]): FollowUpStep | null {
    return (
      steps
        .filter(
          (step) =>
            !step.parentId &&
            (step.actionType === FollowUpActionType.SEND_MESSAGE ||
              step.actionType === FollowUpActionType.SEND_EMAIL ||
              step.type === FollowUpStepType.SEND_MESSAGE ||
              step.type === FollowUpStepType.SEND_EMAIL)
        )
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        )[0] ?? null
    )
  }

  private async findFollowUpById(followUpId: string): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({
      where: { id: followUpId }
    })

    if (!followUp) {
      throw new NotFoundException(`FollowUp ${followUpId} not found`)
    }

    return followUp
  }

  private async ensureParentBelongsToFollowUp(
    parentId: string | null | undefined,
    followUpId: string,
    stepId?: string
  ): Promise<void> {
    if (!parentId) return

    const parent = await this.followUpStepRepository.findOne({
      where: { id: parentId, followUpId }
    })

    if (!parent || parent.id === stepId) {
      throw new NotFoundException(
        `FollowUpStep parent ${parentId} not found for FollowUp ${followUpId}`
      )
    }
  }
}

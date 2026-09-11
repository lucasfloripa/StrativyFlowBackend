import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, EntityManager, Repository } from 'typeorm'

import { Negotiation } from '../../negotiation/entities/negotiation.entity'
import { CreateFollowUpStepTreeItemDto } from '../dto/create-followup-step-tree.dto'
import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { FollowUpResponseDto } from '../dto/followup-response.dto'
import {
  UpdateFollowUpDto,
  UpdatePrimaryFollowUpStepDto
} from '../dto/update-followup.dto'
import {
  FollowUpActionType,
  FollowUpStep,
  FollowUpStepStatus,
  FollowUpStepType
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'
import { mapFollowUpToResponseDto } from '../mappers/followup-response.mapper'
import { resolveFollowUpStepScheduledAt } from '../utils/followup-step-schedule'

@Injectable()
export class FollowUpService {
  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>
  ) {}

  async create(dto: CreateFollowUpDto): Promise<FollowUpResponseDto> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: dto.negotiationId },
      select: { id: true }
    })

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${dto.negotiationId} not found`)
    }

    const dueAt = new Date(dto.dueAt)
    const followUp = this.followUpRepository.create({
      negotiationId: dto.negotiationId,
      title: dto.title,
      dueAt,
      status: dto.status,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      reminder1hSentAt: null,
      steps: (dto.steps ?? []).map((step) =>
        this.followUpRepository.manager.create(FollowUpStep, {
          parentId: step.parentId ?? null,
          type: step.type,
          actionType: step.actionType ?? null,
          conditionType: step.conditionType ?? null,
          channel: step.channel ?? null,
          status: FollowUpStepStatus.PENDING,
          waitTime: step.waitTime ?? null,
          waitUnit: step.waitUnit ?? null,
          scheduledAt: resolveFollowUpStepScheduledAt(
            dueAt,
            step.type,
            step.parentId,
            step.waitTime,
            step.waitUnit
          ),
          payload: step.payload ?? null
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
        steps: true
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
        steps: true
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
    if (
      dto.steps !== undefined &&
      (dto.primaryStep !== undefined || dto.automationSteps !== undefined)
    ) {
      throw new BadRequestException(
        'Use either legacy steps or primaryStep/automationSteps fields in a single update request'
      )
    }

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

        if (dto.steps !== undefined) {
          await manager.delete(FollowUpStep, { followUpId: followUp.id })
          followUp.steps = dto.steps.map((step) =>
            manager.create(FollowUpStep, {
              followUpId: followUp.id,
              parentId: step.parentId ?? null,
              type: step.type,
              actionType: step.actionType ?? null,
              conditionType: step.conditionType ?? null,
              channel: step.channel ?? null,
              status: FollowUpStepStatus.PENDING,
              waitTime:
                step.type === FollowUpStepType.CONDITION
                  ? null
                  : (step.waitTime ?? null),
              waitUnit:
                step.type === FollowUpStepType.CONDITION
                  ? null
                  : (step.waitUnit ?? null),
              scheduledAt: resolveFollowUpStepScheduledAt(
                followUp.dueAt,
                step.type,
                step.parentId,
                step.waitTime,
                step.waitUnit
              ),
              payload: step.payload ?? null
            })
          )
          await manager.save(FollowUp, followUp)
        } else {
          await manager.save(FollowUp, {
            ...followUp,
            steps: undefined
          })

          const requiresPrimaryStep =
            dto.primaryStep !== undefined || dto.automationSteps !== undefined
          const primaryStep = requiresPrimaryStep
            ? this.findPrimaryStep(followUp.steps ?? [])
            : null

          if (dto.primaryStep !== undefined) {
            if (!primaryStep) {
              throw new BadRequestException(
                `FollowUp ${followUp.id} primary step not found`
              )
            }

            this.applyPrimaryStepUpdate(primaryStep, dto.primaryStep)
            primaryStep.scheduledAt = resolveFollowUpStepScheduledAt(
              followUp.dueAt,
              primaryStep.type,
              primaryStep.parentId,
              primaryStep.waitTime,
              primaryStep.waitUnit
            )
            await manager.save(FollowUpStep, primaryStep)
          }

          if (dto.automationSteps !== undefined) {
            if (!primaryStep) {
              throw new BadRequestException(
                `FollowUp ${followUp.id} primary step not found`
              )
            }

            await this.replaceAutomationSteps(
              manager,
              followUp.id,
              primaryStep.id,
              dto.automationSteps,
              followUp.steps ?? [],
              followUp.dueAt
            )
          }
        }

        if (
          dto.status === FollowUpStatus.CANCELED ||
          dto.status === FollowUpStatus.SKIPPED
        ) {
          await this.markUnresolvedStepsAsSkipped(manager, followUp.id)
        }

        const reloadedFollowUp = await this.findEntityById(id, manager)

        return mapFollowUpToResponseDto(reloadedFollowUp)
      }
    )
  }

  async remove(id: string): Promise<FollowUpResponseDto> {
    const followUp = await this.findEntityById(id)

    await this.followUpRepository.remove(followUp)

    return mapFollowUpToResponseDto(followUp)
  }

  private findPrimaryStep(steps: FollowUpStep[]): FollowUpStep | null {
    const candidates = steps
      .filter((step) => this.isPrimaryStepCandidate(step))
      .sort((left, right) => {
        const leftTimestamp = left.createdAt?.getTime() ?? 0
        const rightTimestamp = right.createdAt?.getTime() ?? 0

        return leftTimestamp - rightTimestamp
      })

    return candidates[0] ?? null
  }

  private isPrimaryStepCandidate(step: FollowUpStep): boolean {
    if (step.parentId !== null && step.parentId !== undefined) {
      return false
    }

    return (
      step.actionType === FollowUpActionType.SEND_MESSAGE ||
      step.actionType === FollowUpActionType.SEND_EMAIL ||
      step.type === FollowUpStepType.SEND_MESSAGE ||
      step.type === FollowUpStepType.SEND_EMAIL
    )
  }

  private applyPrimaryStepUpdate(
    primaryStep: FollowUpStep,
    update: UpdatePrimaryFollowUpStepDto
  ): void {
    const previousIdentity = {
      type: primaryStep.type,
      actionType: primaryStep.actionType ?? null,
      channel: primaryStep.channel ?? null
    }

    if (update.type !== undefined) primaryStep.type = update.type
    if (update.actionType !== undefined) {
      primaryStep.actionType = update.actionType
    }
    if (update.conditionType !== undefined) {
      primaryStep.conditionType = update.conditionType
    }
    if (update.channel !== undefined) primaryStep.channel = update.channel
    if (update.waitTime !== undefined) primaryStep.waitTime = update.waitTime
    if (update.waitUnit !== undefined) primaryStep.waitUnit = update.waitUnit
    if (update.payload !== undefined) primaryStep.payload = update.payload

    const identityChanged =
      previousIdentity.type !== primaryStep.type ||
      previousIdentity.actionType !== (primaryStep.actionType ?? null) ||
      previousIdentity.channel !== (primaryStep.channel ?? null)

    if (identityChanged) {
      primaryStep.replyMessageId = null
      primaryStep.replyContent = null
      primaryStep.replyType = null
      primaryStep.repliedAt = null
    }
  }

  private async replaceAutomationSteps(
    manager: EntityManager,
    followUpId: string,
    primaryStepId: string,
    automationSteps: CreateFollowUpStepTreeItemDto[],
    existingSteps: FollowUpStep[],
    referenceDate: Date
  ): Promise<void> {
    const stepsByClientId = this.validateAutomationSteps(
      primaryStepId,
      automationSteps
    )

    const nonPrimaryStepIds = existingSteps
      .filter((step) => step.id !== primaryStepId)
      .map((step) => step.id)

    if (nonPrimaryStepIds.length > 0) {
      await manager.delete(FollowUpStep, nonPrimaryStepIds)
    }

    const pendingSteps = new Map(stepsByClientId)
    const persistedIds = new Map<string, string>()

    while (pendingSteps.size > 0) {
      const readySteps = [...pendingSteps.values()].filter(
        (step) => !step.parentClientId || persistedIds.has(step.parentClientId)
      )

      if (readySteps.length === 0) {
        throw new BadRequestException('FollowUpStep tree contains a cycle')
      }

      for (const stepDto of readySteps) {
        const step = manager.create(FollowUpStep, {
          followUpId,
          parentId: stepDto.parentClientId
            ? (persistedIds.get(stepDto.parentClientId) ?? null)
            : primaryStepId,
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
            referenceDate,
            stepDto.type,
            stepDto.parentClientId,
            stepDto.waitTime,
            stepDto.waitUnit
          ),
          payload: stepDto.payload ?? null
        })

        const savedStep = await manager.save(FollowUpStep, step)

        persistedIds.set(stepDto.clientId, savedStep.id)
        pendingSteps.delete(stepDto.clientId)
      }
    }
  }

  private validateAutomationSteps(
    primaryStepId: string,
    steps: CreateFollowUpStepTreeItemDto[]
  ): Map<string, CreateFollowUpStepTreeItemDto> {
    const stepsByClientId = new Map<string, CreateFollowUpStepTreeItemDto>()

    for (const step of steps) {
      if (step.clientId === primaryStepId) {
        throw new BadRequestException(
          'Automation step clientId cannot target the primary step id'
        )
      }

      if (stepsByClientId.has(step.clientId)) {
        throw new BadRequestException(
          `Duplicate FollowUpStep clientId ${step.clientId}`
        )
      }

      stepsByClientId.set(step.clientId, step)
    }

    for (const step of steps) {
      if (step.parentClientId === primaryStepId) {
        throw new BadRequestException(
          'Automation step parentClientId cannot target the primary step id'
        )
      }

      if (step.parentClientId && !stepsByClientId.has(step.parentClientId)) {
        throw new BadRequestException(
          `FollowUpStep parentClientId ${step.parentClientId} not found`
        )
      }
    }

    return stepsByClientId
  }

  private async markUnresolvedStepsAsSkipped(
    manager: EntityManager,
    followUpId: string
  ): Promise<void> {
    await manager.update(
      FollowUpStep,
      {
        followUpId,
        status: In([
          FollowUpStepStatus.PENDING,
          FollowUpStepStatus.WAITING,
          FollowUpStepStatus.EXECUTING,
          FollowUpStepStatus.MANUAL_REQUIRED,
          FollowUpStepStatus.SCHEDULED,
          FollowUpStepStatus.AWAITING_REPLY
        ])
      },
      {
        status: FollowUpStepStatus.SKIPPED,
        executedAt: null,
        failureReason: null
      }
    )
  }
}

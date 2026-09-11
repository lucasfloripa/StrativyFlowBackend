import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { Message, MessageChannel } from '../../leads/entities/message.entity'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStep,
  FollowUpStepType,
  FollowUpStepChannel,
  FollowUpStepStatus
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'
import { activateFollowUpStepScheduledAt } from '../utils/followup-step-schedule'

import {
  FollowUpStepExecutionOutcome,
  FollowUpStepExecutor
} from './followup-step-executor.service'

type PersistedStepResultValue = string | number | boolean | null
type PersistedStepResult = Record<string, PersistedStepResultValue>

const CLAIMABLE_STEP_STATUSES: FollowUpStepStatus[] = [
  FollowUpStepStatus.PENDING,
  FollowUpStepStatus.WAITING,
  FollowUpStepStatus.SCHEDULED
]

const ACTIVE_STEP_STATUSES: FollowUpStepStatus[] = [
  FollowUpStepStatus.PENDING,
  FollowUpStepStatus.WAITING,
  FollowUpStepStatus.EXECUTING,
  FollowUpStepStatus.MANUAL_REQUIRED,
  FollowUpStepStatus.SCHEDULED,
  FollowUpStepStatus.AWAITING_REPLY
]

const RESOLVED_STEP_STATUSES: FollowUpStepStatus[] = [
  FollowUpStepStatus.EXECUTED,
  FollowUpStepStatus.SKIPPED,
  FollowUpStepStatus.FAILED
]

const followUpChannelByMessageChannel: Record<
  MessageChannel,
  FollowUpStepChannel
> = {
  [MessageChannel.WHATSAPP]: FollowUpStepChannel.WHATSAPP,
  [MessageChannel.MESSENGER]: FollowUpStepChannel.MESSENGER,
  [MessageChannel.INSTAGRAM]: FollowUpStepChannel.INSTAGRAM
}

@Injectable()
export class FollowUpExecutor {
  private readonly logger = new Logger(FollowUpExecutor.name)

  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    @InjectRepository(FollowUpStep)
    private readonly followUpStepRepository: Repository<FollowUpStep>,
    private readonly followUpStepExecutor: FollowUpStepExecutor
  ) {}

  async findReadyForExecution(
    referenceDate: Date = new Date()
  ): Promise<FollowUp[]> {
    const executableFollowUps = await this.followUpRepository
      .createQueryBuilder('followUp')
      .innerJoinAndSelect('followUp.negotiation', 'negotiation')
      .innerJoinAndSelect('negotiation.lead', 'lead')
      .leftJoinAndSelect('followUp.steps', 'step')
      .where('followUp.status IN (:...activeFollowUpStatuses)', {
        activeFollowUpStatuses: [
          FollowUpStatus.PENDING,
          FollowUpStatus.AUTOMATING,
          FollowUpStatus.AWAITING_REPLY
        ]
      })
      .andWhere('"followUp"."dueAt" <= :referenceDate', {
        referenceDate
      })
      .orderBy('"followUp"."dueAt"', 'ASC')
      .addOrderBy('"followUp"."createdAt"', 'ASC')
      .getMany()

    if (executableFollowUps.length > 0) {
      this.logger.debug(
        `Found ${executableFollowUps.length} follow-ups eligible for processing at ${referenceDate.toISOString()}`
      )
    }

    return executableFollowUps
  }

  // Backward-compatible alias while callers migrate to findReadyForExecution.
  async findExecutableFollowUps(
    referenceDate: Date = new Date()
  ): Promise<FollowUp[]> {
    return await this.findReadyForExecution(referenceDate)
  }

  async processReadyWork(referenceDate: Date = new Date()): Promise<number> {
    const followUps = await this.findReadyForExecution(referenceDate)

    let processedCount = 0

    for (const followUp of followUps) {
      await this.processFollowUpById(followUp.id, referenceDate)
      processedCount += 1
    }

    return processedCount
  }

  async execute(followUp: FollowUp): Promise<void> {
    await this.processFollowUpById(followUp.id, new Date())
  }

  async processInboundReply(message: Message): Promise<number> {
    const repliedAt = message.externalTimestamp ?? message.createdAt

    const followUps = await this.followUpRepository
      .createQueryBuilder('followUp')
      .innerJoinAndSelect('followUp.negotiation', 'negotiation')
      .innerJoinAndSelect('negotiation.lead', 'lead')
      .leftJoinAndSelect('followUp.steps', 'step')
      .where('followUp.status = :status', {
        status: FollowUpStatus.AWAITING_REPLY
      })
      .andWhere('lead.id = :leadId', { leadId: message.leadId })
      .orderBy('followUp.createdAt', 'ASC')
      .getMany()

    const channel = followUpChannelByMessageChannel[message.channel]
    let linkedFollowUps = 0

    for (const followUp of followUps) {
      const root = this.findRootActionStep(followUp.steps ?? [])

      if (!root || root.executedAt === null || root.executedAt === undefined) {
        continue
      }

      if (root.channel !== channel) {
        continue
      }

      if (root.executedAt.getTime() > repliedAt.getTime()) {
        continue
      }

      if (!root.replyMessageId) {
        await this.followUpStepRepository.update(root.id, {
          replyMessageId: message.id,
          replyContent: message.content ?? null,
          replyType: message.type,
          repliedAt
        })
      }

      await this.processFollowUpById(followUp.id, repliedAt)
      linkedFollowUps += 1
    }

    return linkedFollowUps
  }

  private async processFollowUpById(
    followUpId: string,
    referenceDate: Date
  ): Promise<void> {
    try {
      const followUp = await this.followUpRepository.findOne({
        where: { id: followUpId },
        relations: {
          negotiation: {
            lead: true
          },
          steps: true
        }
      })

      if (!followUp) {
        return
      }

      if (
        followUp.status === FollowUpStatus.CANCELED ||
        followUp.status === FollowUpStatus.SKIPPED
      ) {
        return
      }

      const lead = followUp.negotiation?.lead

      if (!lead) {
        throw new Error(`Lead not loaded for FollowUp ${followUp.id}`)
      }

      const root = this.findRootActionStep(followUp.steps ?? [])

      if (!root) {
        await this.reconcileFollowUpStatus(followUp, referenceDate)
        return
      }

      await this.normalizeLegacyStatuses(followUp, root)
      const refreshedFollowUp = await this.reloadFollowUp(followUp.id)
      const effectiveRoot = this.findRootActionStep(
        refreshedFollowUp.steps ?? []
      )

      if (!effectiveRoot) {
        return
      }

      if (!this.isRootReadyForAutomation(effectiveRoot)) {
        if (refreshedFollowUp.dueAt.getTime() <= referenceDate.getTime()) {
          await this.tryExecuteStep(
            effectiveRoot,
            refreshedFollowUp,
            referenceDate
          )
        }

        const afterRootAttempt = await this.reloadFollowUp(refreshedFollowUp.id)
        const rootAfterAttempt = this.findRootActionStep(
          afterRootAttempt.steps ?? []
        )

        if (
          !rootAfterAttempt ||
          !this.isRootReadyForAutomation(rootAfterAttempt)
        ) {
          await this.reconcileFollowUpStatus(afterRootAttempt, referenceDate)
          return
        }

        await this.activateDescendantSchedules(
          afterRootAttempt,
          rootAfterAttempt
        )
        await this.resolveReadyConditions(afterRootAttempt, referenceDate)

        const postConditionResolution = await this.reloadFollowUp(
          afterRootAttempt.id
        )
        await this.executeReadyDescendants(
          postConditionResolution,
          referenceDate
        )
        await this.reconcileExecutionState(
          postConditionResolution.id,
          referenceDate
        )
        return
      }

      await this.activateDescendantSchedules(refreshedFollowUp, effectiveRoot)
      await this.resolveReadyConditions(refreshedFollowUp, referenceDate)

      let currentFollowUp = await this.reloadFollowUp(refreshedFollowUp.id)
      const currentRoot = this.findRootActionStep(currentFollowUp.steps ?? [])

      if (!currentRoot) {
        return
      }

      if (currentRoot.replyMessageId || currentRoot.repliedAt) {
        await this.skipOppositeNoResponseBranches(
          currentFollowUp,
          currentRoot.id
        )
        currentFollowUp = await this.reloadFollowUp(currentFollowUp.id)
      }

      await this.expireResponseActions(currentFollowUp, referenceDate)
      currentFollowUp = await this.reloadFollowUp(currentFollowUp.id)

      await this.executeReadyDescendants(currentFollowUp, referenceDate)
      await this.reconcileExecutionState(currentFollowUp.id, referenceDate)
    } catch (error: unknown) {
      if (this.isFollowUpMissingAfterCascade(error, followUpId)) {
        return
      }

      throw error
    }
  }

  private async normalizeLegacyStatuses(
    followUp: FollowUp,
    root: FollowUpStep
  ): Promise<void> {
    const updates: Array<Promise<unknown>> = []

    for (const step of followUp.steps ?? []) {
      if (step.id !== root.id && !step.parentId) {
        updates.push(
          this.followUpStepRepository.update(step.id, { parentId: root.id })
        )
      }

      if (step.status === FollowUpStepStatus.SCHEDULED) {
        updates.push(
          this.followUpStepRepository.update(step.id, {
            status: FollowUpStepStatus.PENDING
          })
        )
      }

      if (step.status === FollowUpStepStatus.AWAITING_REPLY) {
        updates.push(
          this.followUpStepRepository.update(step.id, {
            status: FollowUpStepStatus.EXECUTED,
            executedAt: step.executedAt ?? new Date()
          })
        )
      }
    }

    if (
      root.status === FollowUpStepStatus.EXECUTED &&
      (root.replyMessageId || root.repliedAt)
    ) {
      updates.push(
        this.followUpRepository.update(followUp.id, {
          status: FollowUpStatus.AUTOMATING
        })
      )
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  private async executeReadyDescendants(
    followUp: FollowUp,
    referenceDate: Date
  ): Promise<void> {
    const root = this.findRootActionStep(followUp.steps ?? [])

    if (!root) {
      return
    }

    const graph = this.buildChildrenIndex(followUp.steps ?? [])
    const sortedSteps = [...(followUp.steps ?? [])].sort((left, right) => {
      const leftTimestamp =
        left.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightTimestamp =
        right.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER

      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp
      }

      return left.createdAt.getTime() - right.createdAt.getTime()
    })

    for (const step of sortedSteps) {
      if (step.id === root.id || !this.isActionStep(step)) {
        continue
      }

      if (!this.isActiveStepStatus(step.status)) {
        continue
      }

      if (!step.parentId) {
        continue
      }

      const parent = followUp.steps.find(
        (candidate) => candidate.id === step.parentId
      )

      if (!parent || !this.isParentReadyForAutomation(parent, root.id)) {
        if (step.status === FollowUpStepStatus.PENDING) {
          await this.followUpStepRepository.update(step.id, {
            status: FollowUpStepStatus.WAITING
          })
        }
        continue
      }

      const ancestorConditions = this.findAncestorConditions(
        step,
        followUp.steps ?? []
      )

      if (
        ancestorConditions.some(
          (condition) =>
            condition.conditionType === FollowUpConditionType.RESPONSE_RECEIVED
        )
      ) {
        if (!root.replyMessageId && !root.repliedAt) {
          continue
        }

        if (
          step.scheduledAt &&
          step.scheduledAt.getTime() < referenceDate.getTime()
        ) {
          await this.followUpStepRepository.update(step.id, {
            status: FollowUpStepStatus.SKIPPED,
            executedAt: null,
            failureReason: null
          })
          continue
        }

        await this.markConditionAncestorsExecuting(
          ancestorConditions,
          FollowUpConditionType.RESPONSE_RECEIVED
        )
      }

      if (
        ancestorConditions.some(
          (condition) =>
            condition.conditionType === FollowUpConditionType.NO_RESPONSE
        )
      ) {
        if (root.replyMessageId || root.repliedAt) {
          await this.markBranchSkipped(step.id, graph, followUp.steps ?? [])
          continue
        }

        if (
          !step.scheduledAt ||
          step.scheduledAt.getTime() > referenceDate.getTime()
        ) {
          continue
        }

        await this.markConditionAncestorsExecuting(
          ancestorConditions,
          FollowUpConditionType.NO_RESPONSE
        )
      }

      if (
        ancestorConditions.some(
          (condition) =>
            condition.conditionType === FollowUpConditionType.DEADLINE_REACHED
        )
      ) {
        if (followUp.dueAt.getTime() > referenceDate.getTime()) {
          continue
        }

        await this.markConditionAncestorsExecuting(
          ancestorConditions,
          FollowUpConditionType.DEADLINE_REACHED
        )
      }

      const isResponseAction = ancestorConditions.some(
        (condition) =>
          condition.conditionType === FollowUpConditionType.RESPONSE_RECEIVED
      )

      if (
        !isResponseAction &&
        (!step.scheduledAt ||
          step.scheduledAt.getTime() > referenceDate.getTime())
      ) {
        continue
      }

      await this.tryExecuteStep(step, followUp, referenceDate)
    }
  }

  private async resolveReadyConditions(
    followUp: FollowUp,
    referenceDate: Date
  ): Promise<void> {
    const root = this.findRootActionStep(followUp.steps ?? [])

    if (!root) {
      return
    }

    const graph = this.buildChildrenIndex(followUp.steps ?? [])
    const siblingsByParent = this.buildSiblingsIndex(followUp.steps ?? [])

    for (const condition of followUp.steps ?? []) {
      if (
        condition.type !== FollowUpStepType.CONDITION ||
        !this.isActiveStepStatus(condition.status)
      ) {
        continue
      }

      if (!condition.parentId) {
        continue
      }

      const parent = followUp.steps.find(
        (step) => step.id === condition.parentId
      )
      if (!parent || !this.isParentReadyForAutomation(parent, root.id)) {
        if (condition.status === FollowUpStepStatus.PENDING) {
          await this.followUpStepRepository.update(condition.id, {
            status: FollowUpStepStatus.WAITING
          })
        }
        continue
      }

      if (condition.conditionType === FollowUpConditionType.RESPONSE_RECEIVED) {
        await this.followUpStepRepository.update(condition.id, {
          status: FollowUpStepStatus.EXECUTING,
          executedAt: null
        })

        if (!root.replyMessageId && !root.repliedAt) {
          await this.markResponseActionsWaiting(
            condition.id,
            graph,
            followUp.steps ?? []
          )
          continue
        }

        const siblings =
          siblingsByParent.get(condition.parentId ?? '__root__') ?? []
        for (const sibling of siblings) {
          if (
            sibling.id === condition.id ||
            sibling.type !== FollowUpStepType.CONDITION ||
            sibling.conditionType !== FollowUpConditionType.NO_RESPONSE
          ) {
            continue
          }

          await this.markBranchSkipped(sibling.id, graph, followUp.steps ?? [])
        }
        continue
      }

      if (condition.conditionType === FollowUpConditionType.DEADLINE_REACHED) {
        if (followUp.dueAt.getTime() > referenceDate.getTime()) {
          continue
        }

        await this.followUpStepRepository.update(condition.id, {
          status: FollowUpStepStatus.EXECUTING,
          executedAt: null
        })
        continue
      }

      if (condition.conditionType === FollowUpConditionType.NO_RESPONSE) {
        if (root.replyMessageId || root.repliedAt) {
          await this.markBranchSkipped(
            condition.id,
            graph,
            followUp.steps ?? []
          )
          continue
        }

        const children = graph.get(condition.id) ?? []
        const hasDueActionChild = children.some(
          (child) =>
            this.isActionStep(child) &&
            this.isActiveStepStatus(child.status) &&
            (!child.scheduledAt ||
              child.scheduledAt.getTime() <= referenceDate.getTime())
        )

        if (!hasDueActionChild) {
          continue
        }

        await this.followUpStepRepository.update(condition.id, {
          status: FollowUpStepStatus.EXECUTING,
          executedAt: null
        })
      }
    }
  }

  private async markResponseActionsWaiting(
    conditionId: string,
    childrenByParentId: Map<string, FollowUpStep[]>,
    steps: FollowUpStep[]
  ): Promise<void> {
    const queue = [...(childrenByParentId.get(conditionId) ?? [])]

    while (queue.length > 0) {
      const step = queue.shift()

      if (!step) {
        continue
      }

      if (this.isActionStep(step) && this.isActiveStepStatus(step.status)) {
        await this.followUpStepRepository.update(step.id, {
          status: FollowUpStepStatus.WAITING
        })
        step.status = FollowUpStepStatus.WAITING
      }

      queue.push(...(childrenByParentId.get(step.id) ?? []))
    }

    const condition = steps.find((step) => step.id === conditionId)
    if (condition) {
      condition.status = FollowUpStepStatus.EXECUTING
    }
  }

  private async tryExecuteStep(
    step: FollowUpStep,
    followUp: FollowUp,
    executedAt: Date
  ): Promise<void> {
    if (step.channel === FollowUpStepChannel.AGENDA) {
      await this.followUpStepRepository.update(step.id, {
        status: FollowUpStepStatus.MANUAL_REQUIRED,
        executedAt: null
      })
      return
    }

    const claimed = await this.claimStep(step.id)

    if (!claimed) {
      return
    }

    this.logger.log(
      `Executing follow-up step. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, stepId=${step.id}, stepType=${step.type}, channel=${step.channel ?? 'none'}`
    )

    try {
      const outcome = await this.followUpStepExecutor.executeWithResult(
        step,
        followUp.negotiation.lead,
        followUp.negotiationId
      )
      const status = outcome.status

      const finalStatus =
        status === FollowUpStepStatus.AWAITING_REPLY
          ? FollowUpStepStatus.EXECUTED
          : status

      const result = this.normalizeStepResult(outcome)
      const serializedResult = JSON.stringify(result)

      await this.followUpStepRepository
        .createQueryBuilder()
        .update(FollowUpStep)
        .set({
          status: finalStatus,
          result: () => ':result::jsonb',
          executedAt:
            finalStatus === FollowUpStepStatus.EXECUTED ? executedAt : null,
          failureReason: null
        })
        .setParameters({ result: serializedResult })
        .where('id = :id', { id: step.id })
        .andWhere('status = :status', { status: FollowUpStepStatus.EXECUTING })
        .execute()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown execution error'
      const serializedFailureResult = JSON.stringify({
        success: false,
        error: message
      })

      await this.followUpStepRepository
        .createQueryBuilder()
        .update(FollowUpStep)
        .set({
          status: FollowUpStepStatus.FAILED,
          result: () => ':result::jsonb',
          executedAt: null,
          failureReason: message
        })
        .setParameters({ result: serializedFailureResult })
        .where('id = :id', { id: step.id })
        .andWhere('status = :status', { status: FollowUpStepStatus.EXECUTING })
        .execute()

      this.logger.error(
        `Failed to execute follow-up step. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, stepId=${step.id}, stepType=${step.type}, channel=${step.channel ?? 'none'}, error=${message}`,
        error instanceof Error ? error.stack : undefined
      )
    }
  }

  private normalizeStepResult(
    outcome: FollowUpStepExecutionOutcome
  ): PersistedStepResult {
    const persistedResult: PersistedStepResult = {
      success: true
    }

    for (const [key, value] of Object.entries(outcome.result)) {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        persistedResult[key] = value
      }
    }

    return persistedResult
  }

  private isFollowUpMissingAfterCascade(
    error: unknown,
    followUpId: string
  ): boolean {
    return (
      error instanceof Error &&
      error.message === `FollowUp ${followUpId} was not found`
    )
  }

  private async claimStep(stepId: string): Promise<boolean> {
    const result = await this.followUpStepRepository
      .createQueryBuilder()
      .update(FollowUpStep)
      .set({ status: FollowUpStepStatus.EXECUTING })
      .where('id = :id', { id: stepId })
      .andWhere('status IN (:...statuses)', {
        statuses: CLAIMABLE_STEP_STATUSES
      })
      .execute()

    return (result.affected ?? 0) === 1
  }

  private async activateDescendantSchedules(
    followUp: FollowUp,
    root: FollowUpStep
  ): Promise<void> {
    const activationDate =
      root.executedAt ??
      (root.status === FollowUpStepStatus.MANUAL_REQUIRED
        ? followUp.dueAt
        : null)

    if (!activationDate) {
      return
    }

    const updates: Array<Promise<unknown>> = []

    for (const step of followUp.steps ?? []) {
      if (step.id === root.id || !step.parentId) {
        continue
      }

      const scheduledAt = activateFollowUpStepScheduledAt(
        activationDate,
        step.type,
        step.waitTime,
        step.waitUnit
      )

      const shouldResetConditionWait = step.type === FollowUpStepType.CONDITION
      const shouldUpdateSchedule =
        (scheduledAt?.getTime() ?? null) !==
        (step.scheduledAt?.getTime() ?? null)
      const shouldUpdateConditionWait =
        shouldResetConditionWait &&
        ((step.waitTime !== null && step.waitTime !== undefined) ||
          (step.waitUnit !== null && step.waitUnit !== undefined))

      if (!shouldUpdateSchedule && !shouldUpdateConditionWait) {
        continue
      }

      updates.push(
        this.followUpStepRepository.update(step.id, {
          scheduledAt,
          waitTime: shouldResetConditionWait ? null : step.waitTime,
          waitUnit: shouldResetConditionWait ? null : step.waitUnit
        })
      )
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  private async expireResponseActions(
    followUp: FollowUp,
    referenceDate: Date
  ): Promise<void> {
    const root = this.findRootActionStep(followUp.steps ?? [])

    if (!root) {
      return
    }

    const graph = this.buildChildrenIndex(followUp.steps ?? [])
    const responseConditionIdsWithExpiredActions = new Set<string>()

    for (const step of followUp.steps ?? []) {
      if (!this.isActionStep(step) || !this.isActiveStepStatus(step.status)) {
        continue
      }

      const ancestors = this.findAncestorConditions(step, followUp.steps ?? [])
      const isResponseAction = ancestors.some(
        (condition) =>
          condition.conditionType === FollowUpConditionType.RESPONSE_RECEIVED
      )

      if (!isResponseAction) {
        continue
      }

      if (
        !step.scheduledAt ||
        step.scheduledAt.getTime() >= referenceDate.getTime()
      ) {
        continue
      }

      if (root.replyMessageId || root.repliedAt) {
        await this.markBranchSkipped(step.id, graph, followUp.steps ?? [])
        continue
      }

      await this.followUpStepRepository.update(step.id, {
        status: FollowUpStepStatus.SKIPPED,
        executedAt: null,
        failureReason: null
      })
      step.status = FollowUpStepStatus.SKIPPED

      for (const ancestor of ancestors) {
        if (
          ancestor.conditionType === FollowUpConditionType.RESPONSE_RECEIVED
        ) {
          responseConditionIdsWithExpiredActions.add(ancestor.id)
        }
      }
    }

    for (const conditionId of responseConditionIdsWithExpiredActions) {
      const hasActiveAction = this.hasActiveActionDescendant(conditionId, graph)

      if (!hasActiveAction) {
        await this.markBranchSkipped(conditionId, graph, followUp.steps ?? [])
      }
    }
  }

  private hasActiveActionDescendant(
    rootStepId: string,
    childrenByParentId: Map<string, FollowUpStep[]>
  ): boolean {
    const queue = [...(childrenByParentId.get(rootStepId) ?? [])]

    while (queue.length > 0) {
      const step = queue.shift()

      if (!step) {
        continue
      }

      if (this.isActionStep(step) && this.isActiveStepStatus(step.status)) {
        return true
      }

      queue.push(...(childrenByParentId.get(step.id) ?? []))
    }

    return false
  }

  private async skipOppositeNoResponseBranches(
    followUp: FollowUp,
    rootId: string
  ): Promise<void> {
    const graph = this.buildChildrenIndex(followUp.steps ?? [])
    const siblingsByParent = this.buildSiblingsIndex(followUp.steps ?? [])

    for (const step of followUp.steps ?? []) {
      if (
        step.type !== FollowUpStepType.CONDITION ||
        step.conditionType !== FollowUpConditionType.RESPONSE_RECEIVED
      ) {
        continue
      }

      if (step.parentId !== rootId) {
        continue
      }

      await this.followUpStepRepository.update(step.id, {
        status: FollowUpStepStatus.EXECUTING,
        executedAt: null
      })

      const siblings = siblingsByParent.get(step.parentId ?? '__root__') ?? []

      for (const sibling of siblings) {
        if (
          sibling.id === step.id ||
          sibling.type !== FollowUpStepType.CONDITION ||
          sibling.conditionType !== FollowUpConditionType.NO_RESPONSE
        ) {
          continue
        }

        await this.markBranchSkipped(sibling.id, graph, followUp.steps ?? [])
      }
    }
  }

  private async markConditionAncestorsExecuting(
    ancestors: FollowUpStep[],
    conditionType: FollowUpConditionType
  ): Promise<void> {
    for (const ancestor of ancestors) {
      if (
        ancestor.type !== FollowUpStepType.CONDITION ||
        ancestor.conditionType !== conditionType ||
        ancestor.status === FollowUpStepStatus.EXECUTING ||
        ancestor.status === FollowUpStepStatus.EXECUTED
      ) {
        continue
      }

      await this.followUpStepRepository.update(ancestor.id, {
        status: FollowUpStepStatus.EXECUTING,
        executedAt: null
      })
    }
  }

  private async markBranchSkipped(
    rootStepId: string,
    childrenByParentId: Map<string, FollowUpStep[]>,
    steps: FollowUpStep[]
  ): Promise<void> {
    const unresolvedStatuses = ACTIVE_STEP_STATUSES
    const stepIdsToSkip = new Set<string>()
    const queue = [rootStepId]

    while (queue.length > 0) {
      const stepId = queue.shift()

      if (!stepId || stepIdsToSkip.has(stepId)) {
        continue
      }

      const step = steps.find((candidate) => candidate.id === stepId)

      if (step && unresolvedStatuses.includes(step.status)) {
        stepIdsToSkip.add(stepId)
      }

      const children = childrenByParentId.get(stepId) ?? []
      for (const child of children) {
        queue.push(child.id)
      }
    }

    if (stepIdsToSkip.size === 0) {
      return
    }

    await this.followUpStepRepository.update(
      {
        id: In([...stepIdsToSkip])
      },
      {
        status: FollowUpStepStatus.SKIPPED,
        executedAt: null,
        failureReason: null
      }
    )
  }

  private buildChildrenIndex(
    steps: FollowUpStep[]
  ): Map<string, FollowUpStep[]> {
    const byParentId = new Map<string, FollowUpStep[]>()

    for (const step of steps) {
      if (!step.parentId) {
        continue
      }

      const siblings = byParentId.get(step.parentId) ?? []
      siblings.push(step)
      byParentId.set(step.parentId, siblings)
    }

    return byParentId
  }

  private buildSiblingsIndex(
    steps: FollowUpStep[]
  ): Map<string, FollowUpStep[]> {
    const byParentId = new Map<string, FollowUpStep[]>()

    for (const step of steps) {
      const key = step.parentId ?? '__root__'
      const siblings = byParentId.get(key) ?? []
      siblings.push(step)
      byParentId.set(key, siblings)
    }

    return byParentId
  }

  private findAncestorConditions(
    step: FollowUpStep,
    steps: FollowUpStep[]
  ): FollowUpStep[] {
    const byId = new Map(steps.map((entry) => [entry.id, entry]))
    const conditions: FollowUpStep[] = []
    let cursor: FollowUpStep | undefined = step

    while (cursor?.parentId) {
      const parent = byId.get(cursor.parentId)

      if (!parent) {
        break
      }

      if (parent.type === FollowUpStepType.CONDITION) {
        conditions.push(parent)
      }

      cursor = parent
    }

    return conditions
  }

  private findRootActionStep(steps: FollowUpStep[]): FollowUpStep | null {
    const rootActions = steps
      .filter((step) => !step.parentId && this.isActionStep(step))
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
      )

    return rootActions[0] ?? null
  }

  private isActionStep(step: FollowUpStep): boolean {
    return (
      step.type === FollowUpStepType.ACTION ||
      step.type === FollowUpStepType.SEND_MESSAGE ||
      step.type === FollowUpStepType.SEND_EMAIL
    )
  }

  private isResolvedStepStatus(status: FollowUpStepStatus): boolean {
    return RESOLVED_STEP_STATUSES.includes(status)
  }

  private isRootReadyForAutomation(root: FollowUpStep): boolean {
    return (
      this.isResolvedStepStatus(root.status) ||
      root.status === FollowUpStepStatus.MANUAL_REQUIRED ||
      root.status === FollowUpStepStatus.EXECUTING
    )
  }

  private isParentReadyForAutomation(
    parent: FollowUpStep,
    rootId: string
  ): boolean {
    return (
      parent.status === FollowUpStepStatus.EXECUTED ||
      (parent.type === FollowUpStepType.CONDITION &&
        parent.status === FollowUpStepStatus.EXECUTING) ||
      (parent.id === rootId &&
        (parent.status === FollowUpStepStatus.MANUAL_REQUIRED ||
          parent.status === FollowUpStepStatus.EXECUTING))
    )
  }

  private async reconcileExecutionState(
    followUpId: string,
    referenceDate: Date
  ): Promise<void> {
    const followUp = await this.reloadFollowUp(followUpId)
    await this.reconcileAutomationStepStatuses(followUp, referenceDate)
    const reconciledFollowUp = await this.reloadFollowUp(followUpId)
    await this.reconcileFollowUpStatus(reconciledFollowUp, referenceDate)
  }

  private async reconcileAutomationStepStatuses(
    followUp: FollowUp,
    referenceDate: Date
  ): Promise<void> {
    const root = this.findRootActionStep(followUp.steps ?? [])

    if (!root) {
      return
    }

    const childrenByParentId = this.buildChildrenIndex(followUp.steps ?? [])
    const conditions = (followUp.steps ?? [])
      .filter((step) => step.type === FollowUpStepType.CONDITION)
      .sort(
        (left, right) =>
          this.getStepDepth(right, followUp.steps ?? []) -
          this.getStepDepth(left, followUp.steps ?? [])
      )

    for (const condition of conditions) {
      if (condition.status === FollowUpStepStatus.SKIPPED) {
        continue
      }

      const children = childrenByParentId.get(condition.id) ?? []
      if (children.length === 0) {
        continue
      }

      const hasFailedChild = children.some(
        (child) =>
          child.status === FollowUpStepStatus.FAILED ||
          child.status === FollowUpStepStatus.MANUAL_REQUIRED
      )
      const allChildrenFinished = children.every(
        (child) =>
          child.status === FollowUpStepStatus.EXECUTED ||
          child.status === FollowUpStepStatus.SKIPPED
      )

      if (hasFailedChild) {
        condition.status = FollowUpStepStatus.MANUAL_REQUIRED
        condition.executedAt = null
        await this.followUpStepRepository.update(condition.id, {
          status: FollowUpStepStatus.MANUAL_REQUIRED,
          executedAt: null
        })
        continue
      }

      if (allChildrenFinished) {
        condition.status = FollowUpStepStatus.EXECUTED
        condition.executedAt = referenceDate
        await this.followUpStepRepository.update(condition.id, {
          status: FollowUpStepStatus.EXECUTED,
          executedAt: referenceDate,
          failureReason: null
        })
      }
    }

    const automationSteps = (followUp.steps ?? []).filter(
      (step) => step.id !== root.id
    )
    const hasFailedAutomation = automationSteps.some(
      (step) =>
        step.status === FollowUpStepStatus.FAILED ||
        step.status === FollowUpStepStatus.MANUAL_REQUIRED
    )
    const hasActiveAutomation = automationSteps.some((step) =>
      this.isActiveStepStatus(step.status)
    )
    const didAutomationsFinishSuccessfully =
      automationSteps.length > 0 &&
      automationSteps.every(
        (step) =>
          step.status === FollowUpStepStatus.EXECUTED ||
          step.status === FollowUpStepStatus.SKIPPED
      )

    if (hasFailedAutomation) {
      await this.followUpStepRepository.update(root.id, {
        status: FollowUpStepStatus.MANUAL_REQUIRED,
        executedAt: null
      })
      return
    }

    if (
      root.channel === FollowUpStepChannel.AGENDA &&
      didAutomationsFinishSuccessfully
    ) {
      await this.followUpStepRepository.update(root.id, {
        status: FollowUpStepStatus.EXECUTED,
        executedAt: referenceDate,
        failureReason: null
      })
      return
    }

    if (
      root.channel === FollowUpStepChannel.AGENDA &&
      hasActiveAutomation &&
      root.status !== FollowUpStepStatus.EXECUTING
    ) {
      await this.followUpStepRepository.update(root.id, {
        status: FollowUpStepStatus.EXECUTING,
        executedAt: null,
        failureReason: null
      })
    }
  }

  private getStepDepth(step: FollowUpStep, steps: FollowUpStep[]): number {
    const stepsById = new Map(
      steps.map((candidate) => [candidate.id, candidate])
    )
    let depth = 0
    let parentId = step.parentId

    while (parentId) {
      depth += 1
      parentId = stepsById.get(parentId)?.parentId ?? null
    }

    return depth
  }

  private isActiveStepStatus(status: FollowUpStepStatus): boolean {
    return ACTIVE_STEP_STATUSES.includes(status)
  }

  private isMessagingAction(step: FollowUpStep): boolean {
    if (step.type === FollowUpStepType.SEND_MESSAGE) {
      return true
    }

    if (step.type === FollowUpStepType.ACTION) {
      return step.actionType === FollowUpActionType.SEND_MESSAGE
    }

    return false
  }

  private async reconcileFollowUpStatus(
    followUp: FollowUp,
    referenceDate: Date
  ): Promise<void> {
    if (
      followUp.status === FollowUpStatus.CANCELED ||
      followUp.status === FollowUpStatus.SKIPPED
    ) {
      return
    }

    const root = this.findRootActionStep(followUp.steps ?? [])

    if (!root) {
      await this.followUpRepository.update(followUp.id, {
        status: FollowUpStatus.DONE,
        completedAt: referenceDate
      })
      return
    }

    const automationSteps = (followUp.steps ?? []).filter(
      (step) => step.id !== root.id
    )
    const hasActiveAutomation = automationSteps.some((step) =>
      this.isActiveStepStatus(step.status)
    )
    const hasFailedAutomation = automationSteps.some(
      (step) =>
        step.status === FollowUpStepStatus.FAILED ||
        step.status === FollowUpStepStatus.MANUAL_REQUIRED
    )

    if (root.status === FollowUpStepStatus.MANUAL_REQUIRED) {
      const didAutomationsFinishSuccessfully =
        automationSteps.length > 0 &&
        automationSteps.every(
          (step) =>
            step.status === FollowUpStepStatus.EXECUTED ||
            step.status === FollowUpStepStatus.SKIPPED
        )

      if (didAutomationsFinishSuccessfully) {
        await this.followUpStepRepository.update(root.id, {
          status: FollowUpStepStatus.EXECUTED,
          executedAt: referenceDate,
          failureReason: null
        })
        await this.followUpRepository.update(followUp.id, {
          status: FollowUpStatus.DONE,
          completedAt: referenceDate
        })
        return
      }

      await this.followUpRepository.update(followUp.id, {
        status:
          !hasFailedAutomation && hasActiveAutomation
            ? FollowUpStatus.AUTOMATING
            : FollowUpStatus.PENDING,
        completedAt: null
      })
      return
    }

    if (!this.isResolvedStepStatus(root.status)) {
      await this.followUpRepository.update(followUp.id, {
        status:
          root.status === FollowUpStepStatus.EXECUTING
            ? FollowUpStatus.AUTOMATING
            : FollowUpStatus.PENDING,
        completedAt: null
      })
      return
    }

    const isAwaitingReply =
      this.isMessagingAction(root) &&
      !root.replyMessageId &&
      !root.repliedAt &&
      (followUp.steps ?? []).some(
        (step) =>
          step.type === FollowUpStepType.CONDITION &&
          step.conditionType === FollowUpConditionType.RESPONSE_RECEIVED &&
          this.isActiveStepStatus(step.status)
      )

    if (isAwaitingReply) {
      await this.followUpRepository.update(followUp.id, {
        status: FollowUpStatus.AWAITING_REPLY,
        completedAt: null
      })
      return
    }

    if (hasActiveAutomation) {
      await this.followUpRepository.update(followUp.id, {
        status: FollowUpStatus.AUTOMATING,
        completedAt: null
      })
      return
    }

    await this.followUpRepository.update(followUp.id, {
      status: FollowUpStatus.DONE,
      completedAt: referenceDate
    })
  }

  private async reloadFollowUp(followUpId: string): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({
      where: { id: followUpId },
      relations: {
        negotiation: {
          lead: true
        },
        steps: true
      }
    })

    if (!followUp) {
      throw new Error(`FollowUp ${followUpId} was not found`)
    }

    return followUp
  }
}

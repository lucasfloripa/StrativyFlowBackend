import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EntityManager, Repository } from 'typeorm'

import { Negotiation } from '../../negotiation/entities/negotiation.entity'
import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStep,
  FollowUpStepStatus,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { FollowUpService } from './followup.service'

type InMemoryState = {
  followUp: FollowUp
  steps: FollowUpStep[]
  nextGeneratedStepId: number
}

const followUpId = '7281248f-ee2d-4ce8-bbcf-f3fefcd829e7'
const negotiationId = 'f8498877-1aaf-4a58-a7ec-a0bd6aa4d6fc'

const createStep = (overrides: Partial<FollowUpStep> = {}): FollowUpStep =>
  Object.assign(new FollowUpStep(), {
    id: 'step-default',
    followUpId,
    parentId: null,
    type: FollowUpStepType.ACTION,
    actionType: FollowUpActionType.SEND_MESSAGE,
    conditionType: null,
    channel: null,
    status: FollowUpStepStatus.PENDING,
    waitTime: null,
    waitUnit: null,
    scheduledAt: null,
    payload: null,
    result: null,
    executedAt: null,
    failureReason: null,
    replyMessageId: null,
    replyContent: null,
    replyType: null,
    repliedAt: null,
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    ...overrides
  })

const createFollowUp = (steps: FollowUpStep[]): FollowUp =>
  Object.assign(new FollowUp(), {
    id: followUpId,
    negotiationId,
    title: 'Original title',
    dueAt: new Date('2026-09-12T10:00:00.000Z'),
    status: FollowUpStatus.PENDING,
    completedAt: null,
    reminder1hSentAt: new Date('2026-09-08T09:00:00.000Z'),
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    steps
  })

const cloneState = (state: InMemoryState): InMemoryState => {
  const clonedSteps = state.steps.map((step) =>
    createStep({
      ...step,
      payload: step.payload ? { ...step.payload } : null,
      result: step.result ? { ...step.result } : null,
      executedAt: step.executedAt ? new Date(step.executedAt) : null,
      scheduledAt: step.scheduledAt ? new Date(step.scheduledAt) : null,
      repliedAt: step.repliedAt ? new Date(step.repliedAt) : null,
      createdAt: new Date(step.createdAt),
      updatedAt: new Date(step.updatedAt)
    })
  )

  return {
    followUp: createFollowUp(clonedSteps),
    steps: clonedSteps,
    nextGeneratedStepId: state.nextGeneratedStepId
  }
}

const createService = () => {
  const primary = createStep({
    id: 'primary-step',
    parentId: null,
    type: FollowUpStepType.ACTION,
    actionType: FollowUpActionType.SEND_MESSAGE,
    status: FollowUpStepStatus.AWAITING_REPLY,
    channel: null,
    payload: { message: 'old message' },
    result: { delivered: true },
    executedAt: new Date('2026-09-08T08:00:00.000Z'),
    replyMessageId: 'reply-1',
    replyContent: 'answer',
    replyType: 'text',
    repliedAt: new Date('2026-09-08T08:05:00.000Z')
  })
  const oldAutomationRoot = createStep({
    id: 'old-root',
    parentId: null,
    type: FollowUpStepType.CONDITION,
    actionType: null,
    conditionType: FollowUpConditionType.NO_RESPONSE
  })
  const oldAutomationChild = createStep({
    id: 'old-child',
    parentId: 'old-root',
    type: FollowUpStepType.ACTION,
    actionType: FollowUpActionType.QUALIFY_LEAD
  })

  let state: InMemoryState = {
    followUp: createFollowUp([primary, oldAutomationRoot, oldAutomationChild]),
    steps: [primary, oldAutomationRoot, oldAutomationChild],
    nextGeneratedStepId: 0
  }

  const synchronizeRelations = (): void => {
    state.followUp.steps = state.steps
      .filter((step) => step.followUpId === state.followUp.id)
      .map((step) => step)
  }

  const findFollowUp = (id: string): FollowUp | null => {
    if (id !== state.followUp.id) {
      return null
    }

    synchronizeRelations()
    return Object.assign(new FollowUp(), {
      ...state.followUp,
      steps: state.followUp.steps.map((step) =>
        createStep({
          ...step,
          payload: step.payload ? { ...step.payload } : null,
          result: step.result ? { ...step.result } : null,
          executedAt: step.executedAt ? new Date(step.executedAt) : null,
          scheduledAt: step.scheduledAt ? new Date(step.scheduledAt) : null,
          repliedAt: step.repliedAt ? new Date(step.repliedAt) : null,
          createdAt: new Date(step.createdAt),
          updatedAt: new Date(step.updatedAt)
        })
      )
    })
  }

  const followUpRepository = {
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(findFollowUp(where.id))
    ),
    save: jest.fn((followUp: FollowUp) => {
      state.followUp = Object.assign(state.followUp, followUp)
      synchronizeRelations()
      return Promise.resolve(findFollowUp(state.followUp.id) as FollowUp)
    })
  }

  const stepRepository = {
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        state.steps.find((step) => step.id === where.id)
          ? createStep(
              state.steps.find((step) => step.id === where.id) as FollowUpStep
            )
          : null
      )
    )
  }

  const manager = {
    getRepository: jest.fn((entity: typeof FollowUp | typeof FollowUpStep) =>
      entity === FollowUp ? followUpRepository : stepRepository
    ),
    delete: jest.fn(
      (
        entity: typeof FollowUpStep,
        criteria: string[] | { followUpId: string }
      ) => {
        if (entity !== FollowUpStep) {
          return
        }

        if (Array.isArray(criteria)) {
          const ids = new Set(criteria)
          state.steps = state.steps.filter((step) => !ids.has(step.id))
        } else {
          state.steps = state.steps.filter(
            (step) => step.followUpId !== criteria.followUpId
          )
        }

        synchronizeRelations()
      }
    ),
    create: jest.fn(
      (entity: typeof FollowUpStep, input: Partial<FollowUpStep>) =>
        entity === FollowUpStep
          ? createStep({
              ...input,
              id: input.id ?? '',
              status: input.status ?? FollowUpStepStatus.PENDING
            })
          : input
    ),
    save: jest.fn(
      (
        entity: typeof FollowUp | typeof FollowUpStep,
        input: FollowUp | FollowUpStep
      ) => {
        if (entity === FollowUp) {
          state.followUp = Object.assign(state.followUp, input)
          synchronizeRelations()
          return findFollowUp(state.followUp.id) as FollowUp
        }

        const stepInput = input as FollowUpStep
        const existingIndex = state.steps.findIndex(
          (step) => step.id === stepInput.id
        )
        const persisted = createStep({
          ...stepInput,
          id:
            stepInput.id && stepInput.id.length > 0
              ? stepInput.id
              : `generated-step-${++state.nextGeneratedStepId}`,
          createdAt:
            existingIndex >= 0
              ? state.steps[existingIndex].createdAt
              : new Date('2026-09-09T12:00:00.000Z'),
          updatedAt: new Date('2026-09-09T12:00:00.000Z')
        })

        if (existingIndex >= 0) {
          state.steps[existingIndex] = persisted
        } else {
          state.steps.push(persisted)
        }

        synchronizeRelations()

        return createStep(persisted)
      }
    ),
    update: jest.fn(
      (
        entity: typeof FollowUp | typeof FollowUpStep,
        criteria: {
          followUpId: string
          status: { _value?: string[]; value?: string[] }
        },
        updates: Partial<FollowUpStep>
      ) => {
        if (entity !== FollowUpStep) {
          return { affected: 0 }
        }

        const statusValues =
          criteria.status?._value ?? criteria.status?.value ?? []
        state.steps = state.steps.map((step) => {
          if (
            step.followUpId !== criteria.followUpId ||
            !statusValues.includes(step.status)
          ) {
            return step
          }

          return createStep({
            ...step,
            ...updates,
            updatedAt: new Date('2026-09-09T12:00:00.000Z')
          })
        })

        synchronizeRelations()

        return { affected: 1 }
      }
    )
  }

  const followUpRepositoryWithTransaction = {
    ...followUpRepository,
    manager: {
      transaction: jest.fn(
        async (operation: (manager: EntityManager) => Promise<unknown>) => {
          const snapshot = cloneState(state)

          try {
            return await operation(manager as unknown as EntityManager)
          } catch (error) {
            state = cloneState(snapshot)
            synchronizeRelations()
            throw error
          }
        }
      )
    }
  }

  const negotiationRepository = {
    findOne: jest.fn().mockResolvedValue(
      Object.assign(new Negotiation(), {
        id: negotiationId
      })
    )
  }

  const service = new FollowUpService(
    followUpRepositoryWithTransaction as unknown as Repository<FollowUp>,
    negotiationRepository as unknown as Repository<Negotiation>
  )

  return {
    service,
    manager,
    negotiationRepository,
    getState: () => state
  }
}

describe('FollowUpService', () => {
  it('rejects creation when the negotiation no longer exists', async () => {
    const dependencies = createService()
    dependencies.negotiationRepository.findOne.mockResolvedValue(null)
    const dto = Object.assign(new CreateFollowUpDto(), {
      negotiationId,
      title: 'Follow-up',
      dueAt: '2026-09-12T10:00:00.000Z'
    })

    await expect(dependencies.service.create(dto)).rejects.toBeInstanceOf(
      NotFoundException
    )
  })

  it('updates primary step and replaces automation tree transactionally', async () => {
    const dependencies = createService()
    const dto = Object.assign(new UpdateFollowUpDto(), {
      title: 'Updated title',
      primaryStep: {
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        payload: { message: 'new message' }
      },
      automationSteps: [
        {
          clientId: '627dc194-dd9f-4f3e-8dd3-a20fd43d5c80',
          parentClientId: null,
          type: FollowUpStepType.CONDITION,
          conditionType: FollowUpConditionType.NO_RESPONSE,
          waitTime: 2,
          waitUnit: FollowUpWaitUnit.HOURS
        },
        {
          clientId: '5eb6f7ab-1969-4238-b2f0-944dd8708699',
          parentClientId: '627dc194-dd9f-4f3e-8dd3-a20fd43d5c80',
          type: FollowUpStepType.ACTION,
          actionType: FollowUpActionType.QUALIFY_LEAD
        }
      ]
    })

    const response = await dependencies.service.update(followUpId, dto)

    expect(response.title).toBe('Updated title')
    expect(response.steps).toHaveLength(3)
    expect(response.steps.some((step) => step.id === 'old-root')).toBe(false)
    expect(response.steps.some((step) => step.id === 'old-child')).toBe(false)

    const rootCondition = response.steps.find(
      (step) => step.conditionType === FollowUpConditionType.NO_RESPONSE
    )
    const qualifyStep = response.steps.find(
      (step) => step.actionType === FollowUpActionType.QUALIFY_LEAD
    )

    expect(rootCondition).toBeDefined()
    expect(qualifyStep).toBeDefined()
    expect(rootCondition?.parentId).toBe('primary-step')
    expect(rootCondition?.waitTime).toBeNull()
    expect(rootCondition?.waitUnit).toBeNull()
    expect(rootCondition?.scheduledAt).toBeNull()
    expect(qualifyStep?.scheduledAt).toBeNull()
    expect(qualifyStep?.parentId).toBe(rootCondition?.id)
  })

  it('preserves primary id and reply metadata when identity does not change', async () => {
    const dependencies = createService()
    const dto = Object.assign(new UpdateFollowUpDto(), {
      primaryStep: {
        payload: { message: 'edited text only' }
      }
    })

    const response = await dependencies.service.update(followUpId, dto)
    const primaryStep = response.steps.find(
      (step) => step.id === 'primary-step'
    )

    expect(primaryStep).toMatchObject({
      id: 'primary-step',
      replyMessageId: 'reply-1',
      replyContent: 'answer',
      replyType: 'text',
      repliedAt: '2026-09-08T08:05:00.000Z'
    })
  })

  it('clears primary reply metadata when action identity changes', async () => {
    const dependencies = createService()
    const dto = Object.assign(new UpdateFollowUpDto(), {
      primaryStep: {
        actionType: FollowUpActionType.SEND_EMAIL
      }
    })

    const response = await dependencies.service.update(followUpId, dto)
    const primaryStep = response.steps.find(
      (step) => step.id === 'primary-step'
    )

    expect(primaryStep).toMatchObject({
      id: 'primary-step',
      replyMessageId: null,
      replyContent: null,
      replyType: null,
      repliedAt: null
    })
  })

  it('removes all automation steps when automationSteps is empty', async () => {
    const dependencies = createService()

    const response = await dependencies.service.update(
      followUpId,
      Object.assign(new UpdateFollowUpDto(), {
        automationSteps: []
      })
    )

    expect(response.steps).toHaveLength(1)
    expect(response.steps[0].id).toBe('primary-step')
  })

  it('rejects duplicate client ids and rolls back transaction state', async () => {
    const dependencies = createService()
    const previousState = cloneState(dependencies.getState())

    await expect(
      dependencies.service.update(
        followUpId,
        Object.assign(new UpdateFollowUpDto(), {
          title: 'Should rollback',
          automationSteps: [
            {
              clientId: '6febf06b-c5f4-4f0f-8daa-674d9cc6b09c',
              parentClientId: null,
              type: FollowUpStepType.CONDITION,
              conditionType: FollowUpConditionType.NO_RESPONSE
            },
            {
              clientId: '6febf06b-c5f4-4f0f-8daa-674d9cc6b09c',
              parentClientId: null,
              type: FollowUpStepType.ACTION,
              actionType: FollowUpActionType.QUALIFY_LEAD
            }
          ]
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(dependencies.getState().followUp.title).toBe(
      previousState.followUp.title
    )
    expect(dependencies.getState().steps).toHaveLength(
      previousState.steps.length
    )
  })

  it('rejects unknown parent references and cycles', async () => {
    const dependencies = createService()

    await expect(
      dependencies.service.update(
        followUpId,
        Object.assign(new UpdateFollowUpDto(), {
          automationSteps: [
            {
              clientId: 'a85244b7-42b8-4757-a30e-ab64629ef8d8',
              parentClientId: 'missing-parent',
              type: FollowUpStepType.ACTION,
              actionType: FollowUpActionType.QUALIFY_LEAD
            }
          ]
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException)

    await expect(
      dependencies.service.update(
        followUpId,
        Object.assign(new UpdateFollowUpDto(), {
          automationSteps: [
            {
              clientId: 'c5708f79-f42b-41d4-aacc-595db5fbb271',
              parentClientId: '020f9536-7ae7-4b80-a38a-f42f765c45e2',
              type: FollowUpStepType.ACTION,
              actionType: FollowUpActionType.QUALIFY_LEAD
            },
            {
              clientId: '020f9536-7ae7-4b80-a38a-f42f765c45e2',
              parentClientId: 'c5708f79-f42b-41d4-aacc-595db5fbb271',
              type: FollowUpStepType.CONDITION,
              conditionType: FollowUpConditionType.NO_RESPONSE
            }
          ]
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('skips unresolved steps when follow-up is explicitly canceled', async () => {
    const dependencies = createService()

    const response = await dependencies.service.update(
      followUpId,
      Object.assign(new UpdateFollowUpDto(), {
        status: FollowUpStatus.CANCELED
      })
    )

    expect(response.status).toBe(FollowUpStatus.CANCELED)
    expect(
      response.steps.every((step) => step.status === FollowUpStepStatus.SKIPPED)
    ).toBe(true)
  })
})

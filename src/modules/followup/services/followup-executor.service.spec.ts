import { Repository } from 'typeorm'

import { Lead } from '../../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageType
} from '../../leads/entities/message.entity'
import { NegotiationStage } from '../../negotiation/entities/negotiation.entity'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStep,
  FollowUpStepChannel,
  FollowUpStepStatus,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { FollowUpExecutor } from './followup-executor.service'
import { FollowUpStepExecutor } from './followup-step-executor.service'

describe('FollowUpExecutor', () => {
  const lead = Object.assign(new Lead(), { id: 'lead-1' })
  const dueAt = new Date('2026-09-09T10:00:00.000Z')

  const createStep = (overrides: Partial<FollowUpStep>): FollowUpStep =>
    Object.assign(new FollowUpStep(), {
      id: `step-${Math.random()}`,
      followUpId: 'followup-1',
      parentId: null,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.SEND_EMAIL,
      conditionType: null,
      channel: null,
      status: FollowUpStepStatus.PENDING,
      waitTime: null,
      waitUnit: null,
      scheduledAt: dueAt,
      payload: { subject: 'x', to: 'a@b.com', html: '<p>x</p>' },
      result: null,
      executedAt: null,
      failureReason: null,
      replyMessageId: null,
      replyContent: null,
      replyType: null,
      repliedAt: null,
      createdAt: new Date('2026-09-09T09:00:00.000Z'),
      updatedAt: new Date('2026-09-09T09:00:00.000Z'),
      ...overrides
    })

  const cloneStep = (step: FollowUpStep): FollowUpStep =>
    createStep({
      ...step,
      payload: step.payload ? { ...step.payload } : null,
      result: step.result ? { ...step.result } : null,
      scheduledAt: step.scheduledAt ? new Date(step.scheduledAt) : null,
      executedAt: step.executedAt ? new Date(step.executedAt) : null,
      repliedAt: step.repliedAt ? new Date(step.repliedAt) : null,
      createdAt: new Date(step.createdAt),
      updatedAt: new Date(step.updatedAt)
    })

  const createFollowUp = (
    steps: FollowUpStep[],
    status: FollowUpStatus = FollowUpStatus.PENDING,
    customDueAt: Date = dueAt,
    negotiationState: {
      stage: NegotiationStage
      closedAt: Date | null
    } = { stage: NegotiationStage.NEW, closedAt: null }
  ): FollowUp =>
    Object.assign(new FollowUp(), {
      id: 'followup-1',
      negotiationId: 'negotiation-1',
      dueAt: customDueAt,
      status,
      completedAt: null,
      negotiation: {
        ...negotiationState,
        lead
      },
      steps,
      createdAt: new Date('2026-09-09T09:00:00.000Z'),
      updatedAt: new Date('2026-09-09T09:00:00.000Z')
    })

  const createService = (initialFollowUp: FollowUp) => {
    const followUpState = createFollowUp(
      initialFollowUp.steps.map(cloneStep),
      initialFollowUp.status,
      initialFollowUp.dueAt,
      {
        stage: initialFollowUp.negotiation.stage,
        closedAt: initialFollowUp.negotiation.closedAt
      }
    )
    let isFollowUpDeleted = false

    const findStepById = (id: string): FollowUpStep | undefined =>
      followUpState.steps.find((step) => step.id === id)

    const applyStepUpdate = (
      id: string,
      changes: Partial<FollowUpStep>
    ): void => {
      const step = findStepById(id)
      if (!step) {
        return
      }

      Object.assign(step, changes, {
        updatedAt: new Date('2026-09-09T10:00:00.000Z')
      })
    }

    const followUpRepository = {
      findOne: jest.fn(() => {
        if (isFollowUpDeleted) {
          return Promise.resolve(null)
        }

        return Promise.resolve(
          createFollowUp(
            followUpState.steps.map(cloneStep),
            followUpState.status,
            followUpState.dueAt
          )
        )
      }),
      update: jest.fn((_criteria: string, changes: Partial<FollowUp>) => {
        Object.assign(followUpState, changes)
        return Promise.resolve({ affected: 1 })
      }),
      createQueryBuilder: jest.fn(() => {
        const state = {
          statuses: [FollowUpStatus.AWAITING_REPLY],
          leadId: lead.id
        }

        const builder: {
          innerJoinAndSelect: () => typeof builder
          leftJoinAndSelect: () => typeof builder
          where: (
            _query: string,
            params: Record<string, unknown>
          ) => typeof builder
          andWhere: (
            _query: string,
            params?: Record<string, unknown>
          ) => typeof builder
          orderBy: () => typeof builder
          addOrderBy: () => typeof builder
          getMany: () => Promise<FollowUp[]>
        } = {
          innerJoinAndSelect: () => builder,
          leftJoinAndSelect: () => builder,
          where: (_query: string, params: Record<string, unknown>) => {
            if (params.status) {
              state.statuses = [params.status as FollowUpStatus]
            }
            if (params.activeFollowUpStatuses) {
              state.statuses = params.activeFollowUpStatuses as FollowUpStatus[]
            }
            return builder
          },
          andWhere: (_query: string, params?: Record<string, unknown>) => {
            if (params?.leadId) {
              state.leadId = params.leadId as string
            }
            return builder
          },
          orderBy: () => builder,
          addOrderBy: () => builder,
          getMany: () => {
            if (
              state.statuses.includes(followUpState.status) &&
              followUpState.negotiation.lead.id === state.leadId
            ) {
              return Promise.resolve([
                createFollowUp(
                  followUpState.steps.map(cloneStep),
                  followUpState.status,
                  followUpState.dueAt
                )
              ])
            }

            return Promise.resolve([])
          }
        }

        return builder
      })
    }

    const followUpStepRepository = {
      update: jest.fn((criteria: unknown, changes: Partial<FollowUpStep>) => {
        if (typeof criteria === 'string') {
          applyStepUpdate(criteria, changes)
          return Promise.resolve({ affected: 1 })
        }

        let ids: string[] | undefined

        if (typeof criteria === 'object' && criteria && 'id' in criteria) {
          const idCriteria = (
            criteria as { id?: { _value?: string[]; value?: string[] } }
          ).id
          ids = idCriteria?._value ?? idCriteria?.value
        }

        if (Array.isArray(ids)) {
          for (const id of ids) {
            applyStepUpdate(id, changes)
          }
          return Promise.resolve({ affected: ids.length })
        }

        return Promise.resolve({ affected: 0 })
      }),
      createQueryBuilder: jest.fn(() => {
        const queryState: {
          set?: Partial<FollowUpStep>
          params?: Record<string, unknown>
          id?: string
          statuses?: FollowUpStepStatus[]
          status?: FollowUpStepStatus
        } = {}

        const builder: {
          update: () => typeof builder
          set: (set: Partial<FollowUpStep>) => typeof builder
          setParameters: (_params: Record<string, unknown>) => typeof builder
          where: (
            _query: string,
            params: Record<string, unknown>
          ) => typeof builder
          andWhere: (
            query: string,
            params: Record<string, unknown>
          ) => typeof builder
          execute: () => Promise<{ affected: number }>
        } = {
          update: () => builder,
          set: (set: Partial<FollowUpStep>) => {
            queryState.set = set
            return builder
          },
          setParameters: (params: Record<string, unknown>) => {
            queryState.params = params
            return builder
          },
          where: (_query: string, params: Record<string, unknown>) => {
            queryState.id = params.id as string
            return builder
          },
          andWhere: (query: string, params: Record<string, unknown>) => {
            if (query.includes('status IN')) {
              queryState.statuses = params.statuses as FollowUpStepStatus[]
            }
            if (query.includes('status =')) {
              queryState.status = params.status as FollowUpStepStatus
            }
            return builder
          },
          execute: () => {
            const step = queryState.id ? findStepById(queryState.id) : undefined

            if (!step || !queryState.set) {
              return Promise.resolve({ affected: 0 })
            }

            const statusAllowedByList =
              !queryState.statuses || queryState.statuses.includes(step.status)
            const statusAllowedBySingle =
              !queryState.status || queryState.status === step.status

            if (!statusAllowedByList || !statusAllowedBySingle) {
              return Promise.resolve({ affected: 0 })
            }

            const nextSet: Partial<FollowUpStep> = {
              ...queryState.set
            }

            if (
              typeof nextSet.result === 'function' &&
              typeof queryState.params?.result === 'string'
            ) {
              nextSet.result = JSON.parse(queryState.params.result) as Record<
                string,
                unknown
              >
            }

            applyStepUpdate(step.id, nextSet)
            return Promise.resolve({ affected: 1 })
          }
        }

        return builder
      })
    }

    const actionExecutor = {
      execute: jest.fn((step: FollowUpStep) => {
        if (step.id.includes('msg')) {
          return Promise.resolve(FollowUpStepStatus.AWAITING_REPLY)
        }

        return Promise.resolve(FollowUpStepStatus.EXECUTED)
      }),
      executeWithResult: jest.fn((step: FollowUpStep) => {
        if (step.id.includes('msg')) {
          return Promise.resolve({
            status: FollowUpStepStatus.AWAITING_REPLY,
            result: { success: true, sourceStepId: step.id }
          })
        }

        return Promise.resolve({
          status: FollowUpStepStatus.EXECUTED,
          result: { success: true, sourceStepId: step.id }
        })
      })
    }

    const service = new FollowUpExecutor(
      followUpRepository as unknown as Repository<FollowUp>,
      followUpStepRepository as unknown as Repository<FollowUpStep>,
      actionExecutor as unknown as FollowUpStepExecutor
    )

    return {
      service,
      actionExecutor,
      deleteFollowUp: () => {
        isFollowUpDeleted = true
        followUpState.steps = []
      },
      getFollowUp: () => followUpState,
      followUpRepository,
      followUpStepRepository
    }
  }

  it('keeps root pending when dueAt is in the future', async () => {
    const root = createStep({ id: 'root', parentId: null })
    const futureFollowUp = createFollowUp(
      [root],
      FollowUpStatus.PENDING,
      new Date('2099-09-09T11:00:00.000Z')
    )
    const dependencies = createService(futureFollowUp)

    await dependencies.service.execute(futureFollowUp)

    expect(dependencies.actionExecutor.executeWithResult).not.toHaveBeenCalled()
    expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.PENDING)
  })

  it('activates descendant runtime schedule from root execution time', async () => {
    const root = createStep({
      id: 'root',
      parentId: null,
      status: FollowUpStepStatus.PENDING
    })
    const child = createStep({
      id: 'child',
      parentId: 'root',
      status: FollowUpStepStatus.PENDING,
      waitTime: 2,
      waitUnit: FollowUpWaitUnit.HOURS,
      scheduledAt: null
    })
    const followUp = createFollowUp([root, child])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    const rootExecutedAt = dependencies
      .getFollowUp()
      .steps.find((step) => step.id === 'root')?.executedAt
    const childScheduledAt = dependencies
      .getFollowUp()
      .steps.find((step) => step.id === 'child')?.scheduledAt

    expect(rootExecutedAt).toBeInstanceOf(Date)
    expect(childScheduledAt).toBeInstanceOf(Date)
    expect(childScheduledAt?.getTime()).toBe(
      (rootExecutedAt as Date).getTime() + 2 * 60 * 60 * 1000
    )
  })

  it('attaches and executes legacy automation roots under the primary Step', async () => {
    const root = createStep({
      id: 'root',
      parentId: null,
      status: FollowUpStepStatus.EXECUTED,
      executedAt: dueAt
    })
    const legacyAutomationRoot = createStep({
      id: 'legacy-automation-root',
      parentId: null,
      status: FollowUpStepStatus.PENDING,
      waitTime: 0,
      scheduledAt: null,
      createdAt: new Date('2026-09-09T09:30:00.000Z')
    })
    const followUp = createFollowUp([root, legacyAutomationRoot])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    expect(
      dependencies
        .getFollowUp()
        .steps.find((step) => step.id === legacyAutomationRoot.id)
    ).toMatchObject({
      parentId: root.id,
      status: FollowUpStepStatus.EXECUTED
    })
  })

  it('completes an Agenda follow-up after its deadline automations succeed', async () => {
    const root = createStep({
      id: 'root',
      parentId: null,
      status: FollowUpStepStatus.PENDING,
      channel: FollowUpStepChannel.AGENDA
    })
    const condition = createStep({
      id: 'deadline-condition',
      parentId: 'root',
      type: FollowUpStepType.CONDITION,
      actionType: null,
      conditionType: FollowUpConditionType.DEADLINE_REACHED,
      status: FollowUpStepStatus.PENDING,
      scheduledAt: null
    })
    const child = createStep({
      id: 'qualify-lead',
      parentId: condition.id,
      actionType: FollowUpActionType.QUALIFY_LEAD,
      status: FollowUpStepStatus.PENDING,
      waitTime: 0,
      waitUnit: FollowUpWaitUnit.MINUTES,
      scheduledAt: null
    })
    const followUp = createFollowUp([root, condition, child])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === root.id)
        ?.status
    ).toBe(FollowUpStepStatus.EXECUTED)
    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === condition.id)
        ?.status
    ).toBe(FollowUpStepStatus.EXECUTED)
    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === child.id)
        ?.status
    ).toBe(FollowUpStepStatus.EXECUTED)
    expect(dependencies.actionExecutor.executeWithResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: child.id }),
      lead,
      'negotiation-1'
    )
    expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.DONE)
    expect(dependencies.getFollowUp().completedAt).toBeInstanceOf(Date)
  })

  it('keeps an Agenda follow-up manual when it has no automations', async () => {
    const root = createStep({
      id: 'agenda-root',
      parentId: null,
      status: FollowUpStepStatus.PENDING,
      channel: FollowUpStepChannel.AGENDA
    })
    const followUp = createFollowUp([root])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === root.id)
        ?.status
    ).toBe(FollowUpStepStatus.MANUAL_REQUIRED)
    expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.PENDING)
  })

  it('keeps the condition and Agenda root executing until every child finishes', async () => {
    jest.useFakeTimers().setSystemTime(dueAt)

    try {
      const root = createStep({
        id: 'agenda-root',
        parentId: null,
        channel: FollowUpStepChannel.AGENDA
      })
      const condition = createStep({
        id: 'deadline-condition',
        parentId: root.id,
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.DEADLINE_REACHED,
        scheduledAt: null
      })
      const immediateChild = createStep({
        id: 'immediate-child',
        parentId: condition.id,
        actionType: FollowUpActionType.QUALIFY_LEAD,
        waitTime: 0,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: null
      })
      const delayedChild = createStep({
        id: 'delayed-child',
        parentId: condition.id,
        actionType: FollowUpActionType.CHANGE_TEMPERATURE,
        waitTime: 30,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: null
      })
      const followUp = createFollowUp([
        root,
        condition,
        immediateChild,
        delayedChild
      ])
      const dependencies = createService(followUp)

      await dependencies.service.execute(followUp)

      expect(
        dependencies.getFollowUp().steps.find((step) => step.id === root.id)
          ?.status
      ).toBe(FollowUpStepStatus.EXECUTING)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === condition.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTING)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === immediateChild.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === delayedChild.id)?.status
      ).toBe(FollowUpStepStatus.PENDING)
      expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.AUTOMATING)

      jest.setSystemTime(new Date(dueAt.getTime() + 30 * 60 * 1000))
      await dependencies.service.execute(dependencies.getFollowUp())

      expect(
        dependencies.getFollowUp().steps.find((step) => step.id === root.id)
          ?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === condition.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
      expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.DONE)
    } finally {
      jest.useRealTimers()
    }
  })

  it('promotes child failure to manual action on its condition and root', async () => {
    const root = createStep({
      id: 'agenda-root',
      parentId: null,
      channel: FollowUpStepChannel.AGENDA
    })
    const condition = createStep({
      id: 'deadline-condition',
      parentId: root.id,
      type: FollowUpStepType.CONDITION,
      actionType: null,
      conditionType: FollowUpConditionType.DEADLINE_REACHED,
      scheduledAt: null
    })
    const child = createStep({
      id: 'failing-child',
      parentId: condition.id,
      actionType: FollowUpActionType.QUALIFY_LEAD,
      waitTime: 0,
      waitUnit: FollowUpWaitUnit.MINUTES,
      scheduledAt: null
    })
    const followUp = createFollowUp([root, condition, child])
    const dependencies = createService(followUp)
    dependencies.actionExecutor.executeWithResult.mockRejectedValueOnce(
      new Error('qualification failed')
    )

    await dependencies.service.execute(followUp)

    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === child.id)
        ?.status
    ).toBe(FollowUpStepStatus.FAILED)
    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === condition.id)
        ?.status
    ).toBe(FollowUpStepStatus.MANUAL_REQUIRED)
    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === root.id)
        ?.status
    ).toBe(FollowUpStepStatus.MANUAL_REQUIRED)
    expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.PENDING)
  })

  it('marks follow-up awaiting reply after successful root message execution', async () => {
    const root = createStep({
      id: 'root-msg',
      parentId: null,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.SEND_MESSAGE,
      channel: FollowUpStepChannel.WHATSAPP,
      payload: { message: 'hello' }
    })
    const responseCondition = createStep({
      id: 'cond-response',
      parentId: 'root-msg',
      type: FollowUpStepType.CONDITION,
      actionType: null,
      conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
      scheduledAt: null
    })
    const followUp = createFollowUp([root, responseCondition])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    expect(dependencies.getFollowUp().status).toBe(
      FollowUpStatus.AWAITING_REPLY
    )
    expect(
      dependencies.getFollowUp().steps.find((step) => step.id === 'root-msg')
        ?.status
    ).toBe(FollowUpStepStatus.EXECUTED)
  })

  it.each([
    {
      label: 'open',
      stage: NegotiationStage.NEW,
      closedAt: null
    },
    {
      label: 'won',
      stage: NegotiationStage.WON,
      closedAt: new Date('2026-09-09T09:30:00.000Z')
    },
    {
      label: 'lost',
      stage: NegotiationStage.LOST,
      closedAt: new Date('2026-09-09T09:30:00.000Z')
    }
  ])(
    'processes a due WhatsApp root for a $label negotiation through the cron path',
    async ({ stage, closedAt }) => {
      const root = createStep({
        id: 'root-msg-cron',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.WHATSAPP,
        payload: {
          phone: '5548999990000',
          templateId: 'template-1',
          variables: {}
        }
      })
      const followUp = createFollowUp([root], FollowUpStatus.PENDING, dueAt, {
        stage,
        closedAt
      })
      const dependencies = createService(followUp)

      await expect(dependencies.service.processReadyWork(dueAt)).resolves.toBe(
        1
      )
      expect(
        dependencies.actionExecutor.executeWithResult
      ).toHaveBeenCalledTimes(1)
      expect(
        dependencies.actionExecutor.executeWithResult
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: root.id }),
        lead,
        followUp.negotiationId
      )
      expect(
        dependencies.getFollowUp().steps.find((step) => step.id === root.id)
          ?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
    }
  )

  it('expires response actions independently while keeping the condition executing', async () => {
    jest.useFakeTimers().setSystemTime(dueAt)

    try {
      const root = createStep({
        id: 'root-msg',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.WHATSAPP,
        payload: { message: 'hello' }
      })
      const responseCondition = createStep({
        id: 'cond-response',
        parentId: root.id,
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
        scheduledAt: null
      })
      const twoMinuteAction = createStep({
        id: 'response-action-2-minutes',
        parentId: responseCondition.id,
        waitTime: 2,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: null
      })
      const firstFiveMinuteAction = createStep({
        id: 'response-action-5-minutes-1',
        parentId: responseCondition.id,
        waitTime: 5,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: null
      })
      const secondFiveMinuteAction = createStep({
        id: 'response-action-5-minutes-2',
        parentId: responseCondition.id,
        waitTime: 5,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: null
      })
      const followUp = createFollowUp([
        root,
        responseCondition,
        twoMinuteAction,
        firstFiveMinuteAction,
        secondFiveMinuteAction
      ])
      const dependencies = createService(followUp)

      await dependencies.service.execute(followUp)

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === responseCondition.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTING)
      for (const action of [
        twoMinuteAction,
        firstFiveMinuteAction,
        secondFiveMinuteAction
      ]) {
        expect(
          dependencies.getFollowUp().steps.find((step) => step.id === action.id)
            ?.status
        ).toBe(FollowUpStepStatus.WAITING)
      }

      jest.setSystemTime(new Date(dueAt.getTime() + 2 * 60 * 1000 + 1))
      await dependencies.service.execute(dependencies.getFollowUp())

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === responseCondition.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTING)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === twoMinuteAction.id)?.status
      ).toBe(FollowUpStepStatus.SKIPPED)
      for (const action of [firstFiveMinuteAction, secondFiveMinuteAction]) {
        expect(
          dependencies.getFollowUp().steps.find((step) => step.id === action.id)
            ?.status
        ).toBe(FollowUpStepStatus.WAITING)
      }

      jest.setSystemTime(new Date(dueAt.getTime() + 5 * 60 * 1000 + 1))
      await dependencies.service.execute(dependencies.getFollowUp())

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === responseCondition.id)?.status
      ).toBe(FollowUpStepStatus.SKIPPED)
      for (const action of [firstFiveMinuteAction, secondFiveMinuteAction]) {
        expect(
          dependencies.getFollowUp().steps.find((step) => step.id === action.id)
            ?.status
        ).toBe(FollowUpStepStatus.SKIPPED)
      }
    } finally {
      jest.useRealTimers()
    }
  })

  it('skips expired response actions independently when reply arrives after their window', async () => {
    const root = createStep({
      id: 'root-msg',
      parentId: null,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.SEND_MESSAGE,
      channel: FollowUpStepChannel.INSTAGRAM,
      status: FollowUpStepStatus.EXECUTED,
      executedAt: new Date('2026-09-09T10:00:00.000Z')
    })
    const responseCondition = createStep({
      id: 'cond-response',
      parentId: 'root-msg',
      type: FollowUpStepType.CONDITION,
      actionType: null,
      conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
      status: FollowUpStepStatus.PENDING,
      scheduledAt: null
    })
    const responseAction = createStep({
      id: 'response-action',
      parentId: 'cond-response',
      status: FollowUpStepStatus.PENDING,
      scheduledAt: new Date('2026-09-09T10:05:00.000Z')
    })
    const followUp = createFollowUp(
      [root, responseCondition, responseAction],
      FollowUpStatus.AWAITING_REPLY
    )
    const dependencies = createService(followUp)
    const inbound = {
      id: 'inbound-1',
      leadId: 'lead-1',
      channel: MessageChannel.INSTAGRAM,
      type: MessageType.TEXT,
      content: 'reply',
      createdAt: new Date('2026-09-09T10:10:00.000Z')
    } as Message

    await dependencies.service.processInboundReply(inbound)

    expect(
      dependencies
        .getFollowUp()
        .steps.find((step) => step.id === 'response-action')?.status
    ).toBe(FollowUpStepStatus.SKIPPED)
  })

  it('keeps a response branch open while a sibling action window is valid', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T10:10:00.000Z'))

    try {
      const root = createStep({
        id: 'root-msg',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.INSTAGRAM,
        status: FollowUpStepStatus.EXECUTED,
        executedAt: new Date('2026-09-09T10:00:00.000Z')
      })
      const responseCondition = createStep({
        id: 'cond-response',
        parentId: 'root-msg',
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
      const expiredAction = createStep({
        id: 'expired-response-action',
        parentId: 'cond-response',
        waitTime: 5,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: new Date('2026-09-09T10:05:00.000Z')
      })
      const validAction = createStep({
        id: 'valid-response-action',
        parentId: 'cond-response',
        waitTime: 30,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: new Date('2026-09-09T10:30:00.000Z')
      })
      const followUp = createFollowUp(
        [root, responseCondition, expiredAction, validAction],
        FollowUpStatus.AWAITING_REPLY
      )
      const dependencies = createService(followUp)

      await dependencies.service.execute(followUp)

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === expiredAction.id)?.status
      ).toBe(FollowUpStepStatus.SKIPPED)
      expect(dependencies.getFollowUp().status).toBe(
        FollowUpStatus.AWAITING_REPLY
      )

      await dependencies.service.processInboundReply({
        id: 'inbound-valid-window',
        leadId: lead.id,
        channel: MessageChannel.INSTAGRAM,
        type: MessageType.TEXT,
        content: 'reply',
        createdAt: new Date('2026-09-09T10:20:00.000Z')
      } as Message)

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === validAction.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
    } finally {
      jest.useRealTimers()
    }
  })

  it('finishes when every response action window expires without a reply', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T10:10:00.000Z'))

    try {
      const root = createStep({
        id: 'root-msg',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        status: FollowUpStepStatus.EXECUTED,
        executedAt: new Date('2026-09-09T10:00:00.000Z')
      })
      const responseCondition = createStep({
        id: 'cond-response',
        parentId: 'root-msg',
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
      const responseAction = createStep({
        id: 'expired-response-action',
        parentId: 'cond-response',
        waitTime: 5,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: new Date('2026-09-09T10:05:00.000Z')
      })
      const followUp = createFollowUp(
        [root, responseCondition, responseAction],
        FollowUpStatus.AWAITING_REPLY
      )
      const dependencies = createService(followUp)

      await dependencies.service.execute(followUp)

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === responseCondition.id)?.status
      ).toBe(FollowUpStepStatus.SKIPPED)
      expect(dependencies.getFollowUp().status).toBe(FollowUpStatus.DONE)
    } finally {
      jest.useRealTimers()
    }
  })

  it('executes no-response action without closing a valid response window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T10:05:00.000Z'))

    try {
      const root = createStep({
        id: 'root-msg',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.WHATSAPP,
        status: FollowUpStepStatus.EXECUTED,
        executedAt: new Date('2026-09-09T10:00:00.000Z')
      })
      const responseCondition = createStep({
        id: 'cond-response',
        parentId: 'root-msg',
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
      const noResponseCondition = createStep({
        id: 'cond-no-response',
        parentId: 'root-msg',
        type: FollowUpStepType.CONDITION,
        actionType: null,
        conditionType: FollowUpConditionType.NO_RESPONSE,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
      const responseAction = createStep({
        id: 'response-action',
        parentId: 'cond-response',
        status: FollowUpStepStatus.PENDING,
        waitTime: 30,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: new Date('2026-09-09T10:30:00.000Z')
      })
      const noResponseAction = createStep({
        id: 'no-response-action',
        parentId: 'cond-no-response',
        status: FollowUpStepStatus.PENDING,
        waitTime: 5,
        waitUnit: FollowUpWaitUnit.MINUTES,
        scheduledAt: new Date('2026-09-09T10:05:00.000Z')
      })
      const followUp = createFollowUp(
        [
          root,
          responseCondition,
          noResponseCondition,
          responseAction,
          noResponseAction
        ],
        FollowUpStatus.AWAITING_REPLY
      )
      const dependencies = createService(followUp)

      await dependencies.service.execute(followUp)

      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === 'no-response-action')?.status
      ).toBe(FollowUpStepStatus.EXECUTED)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === 'response-action')?.status
      ).toBe(FollowUpStepStatus.WAITING)
      expect(
        dependencies
          .getFollowUp()
          .steps.find((step) => step.id === responseCondition.id)?.status
      ).toBe(FollowUpStepStatus.EXECUTING)
    } finally {
      jest.useRealTimers()
    }
  })

  it('is idempotent when two workers compete for the same step claim', async () => {
    const root = createStep({
      id: 'root',
      parentId: null,
      status: FollowUpStepStatus.EXECUTING
    })
    const followUp = createFollowUp([root])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    expect(dependencies.actionExecutor.executeWithResult).not.toHaveBeenCalled()
    expect(dependencies.getFollowUp().steps[0].status).toBe(
      FollowUpStepStatus.EXECUTING
    )
  })

  it('persists execution result without overwriting payload', async () => {
    const root = createStep({
      id: 'root',
      parentId: null,
      payload: { subject: 'important', to: 'customer@example.com' }
    })
    const followUp = createFollowUp([root])
    const dependencies = createService(followUp)

    await dependencies.service.execute(followUp)

    const persistedRoot = dependencies
      .getFollowUp()
      .steps.find((step) => step.id === 'root')

    expect(persistedRoot?.result).toEqual({
      success: true,
      sourceStepId: 'root'
    })
    expect(persistedRoot?.payload).toEqual({
      subject: 'important',
      to: 'customer@example.com'
    })
  })

  it('tolerates deleted follow-up/step after delete action cascade', async () => {
    const root = createStep({ id: 'delete-root', parentId: null })
    const followUp = createFollowUp([root])
    const dependencies = createService(followUp)

    dependencies.actionExecutor.executeWithResult.mockImplementationOnce(() => {
      dependencies.deleteFollowUp()
      return Promise.resolve({
        status: FollowUpStepStatus.EXECUTED,
        result: {
          success: true,
          deletedNegotiationId: 'negotiation-1'
        }
      })
    })

    await expect(
      dependencies.service.execute(followUp)
    ).resolves.toBeUndefined()
  })
})

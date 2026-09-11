import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EntityManager, Repository } from 'typeorm'

import { CreateFollowUpStepTreeDto } from '../dto/create-followup-step-tree.dto'
import { CreateFollowUpStepDto } from '../dto/create-followup-step.dto'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStep,
  FollowUpStepStatus,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'
import { FollowUp } from '../entities/followup.entity'

import { FollowUpStepService } from './followup-step.service'

describe('FollowUpStepService', () => {
  const followUpId = '3ca92c14-3935-4b59-a917-44529cb455c8'
  const parentId = '76352c54-bcd1-4e93-8cfa-3315345be068'

  const createStep = (overrides: Partial<FollowUpStep> = {}): FollowUpStep =>
    Object.assign(new FollowUpStep(), {
      id: 'a7406c6d-76c4-48c6-b839-c8dde4f06b1d',
      followUpId,
      parentId: null,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.QUALIFY_LEAD,
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

  const createService = () => {
    let generatedId = 0
    const stepRepository = {
      create: jest.fn((input: Partial<FollowUpStep>) => createStep(input)),
      save: jest.fn((step: FollowUpStep) =>
        Promise.resolve(
          createStep({
            ...step,
            id: step.id || `generated-step-${++generatedId}`
          })
        )
      ),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn((step: FollowUpStep) => Promise.resolve(step))
    }
    const followUpRepository = {
      findOne: jest.fn().mockResolvedValue(
        Object.assign(new FollowUp(), {
          id: followUpId,
          dueAt: new Date('2026-09-09T10:00:00.000Z'),
          steps: [
            createStep({
              id: parentId,
              actionType: FollowUpActionType.SEND_MESSAGE
            })
          ]
        })
      )
    }
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === FollowUp ? followUpRepository : stepRepository
      )
    }
    Object.assign(stepRepository, {
      manager: {
        transaction: jest.fn(
          (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager)
        )
      }
    })
    const service = new FollowUpStepService(
      stepRepository as unknown as Repository<FollowUpStep>,
      followUpRepository as unknown as Repository<FollowUp>
    )

    return { service, stepRepository, followUpRepository }
  }

  it('creates a configurable Step without execution fields', async () => {
    const dependencies = createService()
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.QUALIFY_LEAD,
      waitTime: 2,
      waitUnit: FollowUpWaitUnit.HOURS,
      payload: { qualified: true }
    })

    const response = await dependencies.service.create(dto)

    expect(dependencies.stepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        followUpId,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.QUALIFY_LEAD,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: new Date('2026-09-09T12:00:00.000Z'),
        payload: { qualified: true }
      })
    )
    expect(response).toMatchObject({ followUpId, result: null })
  })

  it('clears temporal fields when creating a Condition', async () => {
    const dependencies = createService()
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.CONDITION,
      conditionType: FollowUpConditionType.NO_RESPONSE,
      waitTime: 2,
      waitUnit: FollowUpWaitUnit.HOURS
    })

    await dependencies.service.create(dto)

    expect(dependencies.stepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        waitTime: null,
        waitUnit: null,
        scheduledAt: null
      })
    )
  })

  it('filters Steps by FollowUp', async () => {
    const dependencies = createService()

    await dependencies.service.findAll(followUpId)

    expect(dependencies.stepRepository.find).toHaveBeenCalledWith({
      where: { followUpId },
      order: { createdAt: 'ASC' }
    })
  })

  it('creates an entire Step tree and resolves client parent ids', async () => {
    const dependencies = createService()
    const rootClientId = 'a7406c6d-76c4-48c6-b839-c8dde4f06b1d'
    const childClientId = '76352c54-bcd1-4e93-8cfa-3315345be068'
    const dto = Object.assign(new CreateFollowUpStepTreeDto(), {
      followUpId,
      steps: [
        {
          clientId: childClientId,
          parentClientId: rootClientId,
          type: FollowUpStepType.ACTION,
          actionType: FollowUpActionType.QUALIFY_LEAD,
          waitTime: 0
        },
        {
          clientId: rootClientId,
          parentClientId: null,
          type: FollowUpStepType.CONDITION,
          conditionType: FollowUpConditionType.DEADLINE_REACHED,
          waitTime: 4,
          waitUnit: FollowUpWaitUnit.DAYS
        }
      ]
    })

    const response = await dependencies.service.createTree(dto)

    expect(response.steps).toHaveLength(2)
    expect(response.steps[0].step.scheduledAt).toBeNull()
    expect(response.steps[0].step.parentId).toBe(parentId)
    expect(response.steps[0].step.waitTime).toBeNull()
    expect(response.steps[0].step.waitUnit).toBeNull()
    expect(response.steps[1].step.scheduledAt).toBeNull()
    expect(dependencies.stepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parentId: response.steps[0].step.id })
    )
  })

  it('rejects a Step tree with an unknown parent client id', async () => {
    const dependencies = createService()
    const dto = Object.assign(new CreateFollowUpStepTreeDto(), {
      followUpId,
      steps: [
        {
          clientId: 'a7406c6d-76c4-48c6-b839-c8dde4f06b1d',
          parentClientId: '76352c54-bcd1-4e93-8cfa-3315345be068',
          type: FollowUpStepType.ACTION,
          actionType: FollowUpActionType.QUALIFY_LEAD
        }
      ]
    })

    await expect(dependencies.service.createTree(dto)).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('rejects a parent outside the same FollowUp', async () => {
    const dependencies = createService()
    dependencies.stepRepository.findOne.mockResolvedValue(null)
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      parentId,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.QUALIFY_LEAD
    })

    await expect(dependencies.service.create(dto)).rejects.toBeInstanceOf(
      NotFoundException
    )
  })

  it('recalculates scheduledAt when wait configuration changes', async () => {
    const dependencies = createService()
    const step = createStep({
      scheduledAt: new Date('2026-09-09T10:00:00.000Z')
    })
    dependencies.stepRepository.findOne.mockResolvedValue(step)

    const response = await dependencies.service.update(step.id, {
      waitTime: 3,
      waitUnit: FollowUpWaitUnit.DAYS
    })

    expect(response.scheduledAt).toBe('2026-09-12T10:00:00.000Z')
  })

  it('clears temporal fields when changing a Step to a Condition', async () => {
    const dependencies = createService()
    const step = createStep({
      waitTime: 3,
      waitUnit: FollowUpWaitUnit.DAYS,
      scheduledAt: new Date('2026-09-12T10:00:00.000Z')
    })
    dependencies.stepRepository.findOne.mockResolvedValue(step)

    const response = await dependencies.service.update(step.id, {
      type: FollowUpStepType.CONDITION
    })

    expect(response).toMatchObject({
      waitTime: null,
      waitUnit: null,
      scheduledAt: null
    })
  })

  it('removes an existing Step', async () => {
    const dependencies = createService()
    const step = createStep()
    dependencies.stepRepository.findOne.mockResolvedValue(step)

    await dependencies.service.remove(step.id)

    expect(dependencies.stepRepository.remove).toHaveBeenCalledWith(step)
  })
})

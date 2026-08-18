import { Repository } from 'typeorm'

import { Lead } from '../../leads/entities/lead.entity'
import {
  FollowUpAction,
  FollowUpActionChannel,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { FollowUpActionExecutor } from './followup-action-executor.service'
import { FollowUpExecutor } from './followup-executor.service'

describe('FollowUpExecutor', () => {
  const lead = Object.assign(new Lead(), { id: 'lead-1' })

  const createFollowUp = (action: FollowUpAction): FollowUp =>
    Object.assign(new FollowUp(), {
      id: 'followup-1',
      negotiationId: 'negotiation-1',
      status: FollowUpStatus.PENDING,
      negotiation: { lead },
      actions: [action]
    })

  const createAction = (): FollowUpAction =>
    Object.assign(new FollowUpAction(), {
      id: 'action-1',
      followUpId: 'followup-1',
      type: FollowUpActionType.SEND_EMAIL,
      status: FollowUpActionStatus.PENDING
    })

  const createService = (action: FollowUpAction) => {
    const followUpRepository = {
      update: jest.fn()
    }
    const followUpActionRepository = {
      findOne: jest.fn().mockResolvedValue(action),
      save: jest.fn().mockResolvedValue(action),
      find: jest.fn().mockResolvedValue([action])
    }
    const actionExecutor = {
      execute: jest.fn()
    }
    const service = new FollowUpExecutor(
      followUpRepository as unknown as Repository<FollowUp>,
      followUpActionRepository as unknown as Repository<FollowUpAction>,
      actionExecutor as unknown as FollowUpActionExecutor
    )

    return {
      service,
      followUpRepository,
      followUpActionRepository,
      actionExecutor
    }
  }

  it('marks the action executed and completes the FollowUp', async () => {
    const action = createAction()
    const dependencies = createService(action)
    dependencies.actionExecutor.execute.mockResolvedValue(
      FollowUpActionStatus.EXECUTED
    )

    await dependencies.service.execute(createFollowUp(action))

    expect(action.status).toBe(FollowUpActionStatus.EXECUTED)
    expect(action.executedAt).toBeInstanceOf(Date)
    expect(dependencies.followUpRepository.update).toHaveBeenCalledWith(
      'followup-1',
      expect.objectContaining({ status: FollowUpStatus.DONE })
    )
  })

  it('preserves a failure on the Action and keeps the FollowUp pending', async () => {
    const action = createAction()
    const dependencies = createService(action)
    dependencies.actionExecutor.execute.mockRejectedValue(
      new Error('Transport unavailable')
    )

    await dependencies.service.execute(createFollowUp(action))

    expect(action.status).toBe(FollowUpActionStatus.FAILED)
    expect(action.failureReason).toBe('Transport unavailable')
    expect(dependencies.followUpRepository.update).not.toHaveBeenCalled()
  })

  it('does not execute an Action that is no longer pending', async () => {
    const action = createAction()
    action.status = FollowUpActionStatus.EXECUTED
    const dependencies = createService(action)
    dependencies.followUpActionRepository.findOne.mockResolvedValue(null)

    await dependencies.service.execute(createFollowUp(action))

    expect(dependencies.actionExecutor.execute).not.toHaveBeenCalled()
  })

  it('keeps an Agenda Action and its FollowUp pending', async () => {
    const action = createAction()
    action.type = FollowUpActionType.SEND_MESSAGE
    action.channel = FollowUpActionChannel.AGENDA
    const dependencies = createService(action)

    await dependencies.service.execute(createFollowUp(action))

    expect(action.status).toBe(FollowUpActionStatus.PENDING)
    expect(dependencies.actionExecutor.execute).not.toHaveBeenCalled()
    expect(dependencies.followUpActionRepository.save).not.toHaveBeenCalled()
    expect(dependencies.followUpRepository.update).not.toHaveBeenCalled()
  })

  it('keeps the FollowUp pending when an Action requires manual handling', async () => {
    const action = createAction()
    const dependencies = createService(action)
    dependencies.actionExecutor.execute.mockResolvedValue(
      FollowUpActionStatus.MANUAL_REQUIRED
    )

    await dependencies.service.execute(createFollowUp(action))

    expect(action.status).toBe(FollowUpActionStatus.MANUAL_REQUIRED)
    expect(action.executedAt).toBeNull()
    expect(dependencies.followUpRepository.update).not.toHaveBeenCalled()
  })
})

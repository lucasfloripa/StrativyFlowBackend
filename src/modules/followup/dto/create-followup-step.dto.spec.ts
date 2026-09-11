import { validate } from 'class-validator'

import { MessageChannel } from '../../leads/entities/message.entity'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStepChannel,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'

import { CreateFollowUpStepDto } from './create-followup-step.dto'

describe('CreateFollowUpStepDto', () => {
  const followUpId = '3ca92c14-3935-4b59-a917-44529cb455c8'

  it('accepts an action Step without requiring a channel', async () => {
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.QUALIFY_LEAD,
      payload: { qualified: true }
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('accepts a condition Step with wait configuration', async () => {
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.CONDITION,
      conditionType: FollowUpConditionType.NO_RESPONSE,
      waitTime: 32,
      waitUnit: FollowUpWaitUnit.HOURS
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('accepts a deadline reached condition Step', async () => {
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.CONDITION,
      conditionType: FollowUpConditionType.DEADLINE_REACHED
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('accepts an optional parent and messaging channel', async () => {
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      parentId: '76352c54-bcd1-4e93-8cfa-3315345be068',
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.SEND_MESSAGE,
      channel: MessageChannel.INSTAGRAM,
      payload: { message: 'Hello' }
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('rejects the legacy action value as the structural type', async () => {
    const dto = Object.assign(new CreateFollowUpStepDto(), {
      followUpId,
      type: FollowUpStepType.SEND_MESSAGE,
      actionType: FollowUpActionType.SEND_MESSAGE,
      channel: FollowUpStepChannel.AGENDA
    })

    const errors = await validate(dto)

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'type' })])
    )
  })
})

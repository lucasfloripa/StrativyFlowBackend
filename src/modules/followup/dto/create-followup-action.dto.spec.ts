import { validate } from 'class-validator'

import { MessageChannel } from '../../leads/entities/message.entity'
import {
  FollowUpActionChannel,
  FollowUpActionType
} from '../entities/followup-action.entity'

import { CreateFollowUpActionDto } from './create-followup-action.dto'

describe('CreateFollowUpActionDto', () => {
  it('requires a messaging channel for send_message actions', async () => {
    const dto = Object.assign(new CreateFollowUpActionDto(), {
      type: FollowUpActionType.SEND_MESSAGE,
      payload: { message: 'Hello' }
    })

    const errors = await validate(dto)

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'channel' })])
    )
  })

  it('accepts send_email actions without a messaging channel', async () => {
    const dto = Object.assign(new CreateFollowUpActionDto(), {
      type: FollowUpActionType.SEND_EMAIL,
      payload: {
        to: 'customer@example.com',
        subject: 'Proposal',
        html: '<p>Proposal</p>'
      }
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('accepts existing messaging channels', async () => {
    const dto = Object.assign(new CreateFollowUpActionDto(), {
      type: FollowUpActionType.SEND_MESSAGE,
      channel: MessageChannel.INSTAGRAM,
      payload: { message: 'Hello' }
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('accepts Agenda as a manual FollowUp channel', async () => {
    const dto = Object.assign(new CreateFollowUpActionDto(), {
      type: FollowUpActionType.SEND_MESSAGE,
      channel: FollowUpActionChannel.AGENDA,
      payload: {}
    })

    await expect(validate(dto)).resolves.toEqual([])
  })
})

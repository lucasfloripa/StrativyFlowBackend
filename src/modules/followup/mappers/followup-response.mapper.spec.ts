import { MessageChannel } from '../../leads/entities/message.entity'
import {
  FollowUpAction,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { mapFollowUpToResponseDto } from './followup-response.mapper'

describe('mapFollowUpToResponseDto', () => {
  it('maps actions as the FollowUp execution intent', () => {
    const followUp = Object.assign(new FollowUp(), {
      id: 'followup-1',
      negotiationId: 'negotiation-1',
      title: 'Send proposal',
      status: FollowUpStatus.PENDING,
      dueAt: new Date('2026-08-18T10:00:00.000Z'),
      completedAt: null,
      reminder1hSentAt: null,
      createdAt: new Date('2026-08-15T10:00:00.000Z'),
      updatedAt: new Date('2026-08-15T10:00:00.000Z'),
      actions: [
        Object.assign(new FollowUpAction(), {
          id: 'action-1',
          type: FollowUpActionType.SEND_MESSAGE,
          channel: MessageChannel.WHATSAPP,
          status: FollowUpActionStatus.PENDING,
          payload: {
            templateId: 'template-1',
            variables: { name: 'Lucas' }
          },
          executedAt: null,
          failureReason: null,
          createdAt: new Date('2026-08-15T10:00:00.000Z'),
          updatedAt: new Date('2026-08-15T10:00:00.000Z')
        })
      ]
    })

    const response = mapFollowUpToResponseDto(followUp)

    expect(response.actions).toEqual([
      expect.objectContaining({
        id: 'action-1',
        type: FollowUpActionType.SEND_MESSAGE,
        channel: MessageChannel.WHATSAPP,
        status: FollowUpActionStatus.PENDING,
        payload: {
          templateId: 'template-1',
          variables: { name: 'Lucas' }
        }
      })
    ])
    expect(response).not.toHaveProperty('templateId')
    expect(response).not.toHaveProperty('template')
    expect(response).not.toHaveProperty('templateVariables')
  })
})

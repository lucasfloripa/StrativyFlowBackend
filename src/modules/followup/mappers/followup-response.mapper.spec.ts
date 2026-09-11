import {
  MessageChannel,
  MessageType
} from '../../leads/entities/message.entity'
import {
  FollowUpActionType,
  FollowUpStep,
  FollowUpStepStatus,
  FollowUpStepType
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { mapFollowUpToResponseDto } from './followup-response.mapper'

describe('mapFollowUpToResponseDto', () => {
  it('maps steps as the FollowUp execution intent', () => {
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
      steps: [
        Object.assign(new FollowUpStep(), {
          id: 'step-1',
          followUpId: 'followup-1',
          parentId: null,
          type: FollowUpStepType.ACTION,
          actionType: FollowUpActionType.SEND_MESSAGE,
          conditionType: null,
          channel: MessageChannel.WHATSAPP,
          status: FollowUpStepStatus.PENDING,
          waitTime: null,
          waitUnit: null,
          scheduledAt: new Date('2026-08-18T10:00:00.000Z'),
          payload: {
            templateId: 'template-1',
            variables: { name: 'Lucas' }
          },
          executedAt: null,
          failureReason: null,
          replyMessageId: 'message-1',
          replyContent: 'Tenho interesse',
          replyType: MessageType.TEXT,
          repliedAt: new Date('2026-08-18T11:00:00.000Z'),
          createdAt: new Date('2026-08-15T10:00:00.000Z'),
          updatedAt: new Date('2026-08-15T10:00:00.000Z')
        })
      ]
    })

    const response = mapFollowUpToResponseDto(followUp)

    expect(response.steps).toEqual([
      expect.objectContaining({
        id: 'step-1',
        followUpId: 'followup-1',
        parentId: null,
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: MessageChannel.WHATSAPP,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: '2026-08-18T10:00:00.000Z',
        payload: {
          templateId: 'template-1',
          variables: { name: 'Lucas' }
        },
        replyMessageId: 'message-1',
        replyContent: 'Tenho interesse',
        replyType: MessageType.TEXT,
        repliedAt: '2026-08-18T11:00:00.000Z'
      })
    ])
    expect(response).not.toHaveProperty('templateId')
    expect(response).not.toHaveProperty('template')
    expect(response).not.toHaveProperty('templateVariables')
  })
})

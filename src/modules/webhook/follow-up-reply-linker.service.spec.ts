import {
  Message,
  MessageChannel,
  MessageType
} from '../leads/entities/message.entity'

import { FollowUpReplyLinkerService } from './follow-up-reply-linker.service'

describe('FollowUpReplyLinkerService', () => {
  it('links the same inbound message to every awaiting action returned for the lead and channel', async () => {
    let capturedFindOptions: unknown
    let capturedUpdateCriteria: unknown
    let capturedUpdateChanges: Record<string, unknown> | undefined
    let capturedFollowUpChanges: Record<string, unknown> | undefined
    const find = jest.fn((options: unknown) => {
      capturedFindOptions = options
      return Promise.resolve([
        { id: 'action-1', followUpId: 'followup-1' },
        { id: 'action-2', followUpId: 'followup-2' },
        { id: 'action-3', followUpId: 'followup-3' }
      ])
    })
    const count = jest.fn(() => Promise.resolve(0))
    const update = jest.fn(
      (criteria: unknown, changes: Record<string, unknown>) => {
        capturedUpdateCriteria = criteria
        capturedUpdateChanges = changes
        return Promise.resolve({ affected: 3 })
      }
    )
    const followUpActionRepository = {
      find,
      update,
      count
    }
    const followUpRepository = {
      update: jest.fn(
        (_followUpId: string, changes: Record<string, unknown>) => {
          capturedFollowUpChanges = changes
          return Promise.resolve({ affected: 1 })
        }
      )
    }
    const service = new FollowUpReplyLinkerService(
      followUpActionRepository as never,
      followUpRepository as never
    )
    const repliedAt = new Date('2026-08-26T15:00:00.000Z')
    const message = {
      id: 'message-1',
      leadId: 'lead-1',
      channel: MessageChannel.INSTAGRAM,
      type: MessageType.TEXT,
      content: 'Tenho interesse',
      externalTimestamp: repliedAt,
      createdAt: new Date('2026-08-26T15:00:01.000Z')
    } as Message

    await expect(service.linkReply(message)).resolves.toBe(3)
    expect(followUpActionRepository.find).toHaveBeenCalledTimes(1)

    const findOptions = capturedFindOptions as
      | {
          where: {
            channel: MessageChannel
            replyMessageId: { _type: string }
            followUp: { negotiation: { leadId: string } }
          }
        }
      | undefined

    expect(findOptions?.where.channel).toBe(MessageChannel.INSTAGRAM)
    expect(findOptions?.where.replyMessageId._type).toBe('isNull')
    expect(findOptions?.where.followUp).toEqual({
      negotiation: { leadId: 'lead-1' }
    })

    expect(capturedUpdateCriteria).toBeDefined()
    expect(capturedUpdateChanges).toEqual({
      status: 'executed',
      replyMessageId: 'message-1',
      replyContent: 'Tenho interesse',
      replyType: MessageType.TEXT,
      repliedAt
    })
    expect(count).toHaveBeenCalledTimes(3)
    expect(followUpRepository.update).toHaveBeenCalledTimes(3)
    expect(capturedFollowUpChanges).toEqual({
      status: 'done',
      completedAt: repliedAt
    })
  })
})

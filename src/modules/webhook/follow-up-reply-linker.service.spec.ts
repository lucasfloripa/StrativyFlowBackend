import { FollowUpExecutor } from '../followup/services/followup-executor.service'
import {
  Message,
  MessageChannel,
  MessageType
} from '../leads/entities/message.entity'

import { FollowUpReplyLinkerService } from './follow-up-reply-linker.service'

describe('FollowUpReplyLinkerService', () => {
  it('delegates inbound reply handling to the follow-up executor', async () => {
    const followUpExecutor = {
      processInboundReply: jest.fn().mockResolvedValue(3)
    }
    const service = new FollowUpReplyLinkerService(
      followUpExecutor as unknown as FollowUpExecutor
    )

    const message = {
      id: 'message-1',
      leadId: 'lead-1',
      channel: MessageChannel.INSTAGRAM,
      type: MessageType.TEXT,
      content: 'Tenho interesse',
      externalTimestamp: new Date('2026-08-26T15:00:00.000Z'),
      createdAt: new Date('2026-08-26T15:00:01.000Z')
    } as Message

    await expect(service.linkReply(message)).resolves.toBe(3)
    expect(followUpExecutor.processInboundReply).toHaveBeenCalledWith(message)
  })
})

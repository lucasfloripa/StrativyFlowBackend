import { MessageStatus } from '../leads/entities/message.entity'

import { canTransitionMessageStatus } from './message-status.policy'

describe('canTransitionMessageStatus', () => {
  it.each([
    [null, MessageStatus.SENT, true],
    [MessageStatus.QUEUED, MessageStatus.SENT, true],
    [MessageStatus.QUEUED, MessageStatus.DELIVERED, true],
    [MessageStatus.SENT, MessageStatus.READ, true],
    [MessageStatus.READ, MessageStatus.DELIVERED, false],
    [MessageStatus.SENT, MessageStatus.QUEUED, false],
    [MessageStatus.FAILED, MessageStatus.DELIVERED, false],
    [MessageStatus.RECEIVED, MessageStatus.READ, false]
  ])('%s → %s: %s', (current, next, expected) => {
    expect(canTransitionMessageStatus(current, next)).toBe(expected)
  })
})

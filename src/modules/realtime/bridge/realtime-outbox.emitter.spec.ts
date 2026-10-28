import { Logger } from '@nestjs/common'

import { RealtimeOutboxEmitter } from './realtime-outbox.emitter'

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

describe('RealtimeOutboxEmitter', () => {
  afterEach(() => jest.restoreAllMocks())

  const createEmitter = () => {
    const outboxService = { publish: jest.fn().mockResolvedValue(undefined) }
    const emitter = new RealtimeOutboxEmitter(outboxService as never)

    return { emitter, outboxService }
  }

  it('sends a lead event to the API through the outbox', () => {
    const { emitter, outboxService } = createEmitter()

    emitter.emitToLead('lead-1', 'message.created', { id: 'message-1' })

    expect(outboxService.publish).toHaveBeenCalledWith('realtime.emit', {
      target: 'lead',
      leadId: 'lead-1',
      event: 'message.created',
      payload: { id: 'message-1' }
    })
  })

  it('sends user and broadcast events', () => {
    const { emitter, outboxService } = createEmitter()

    emitter.emitToUser('user-1', 'notification.created', 1)
    emitter.emitBroadcast('ping', 2)

    expect(outboxService.publish).toHaveBeenCalledWith('realtime.emit', {
      target: 'user',
      userId: 'user-1',
      event: 'notification.created',
      payload: 1
    })
    expect(outboxService.publish).toHaveBeenCalledWith('realtime.emit', {
      target: 'broadcast',
      event: 'ping',
      payload: 2
    })
  })

  it('logs instead of failing the caller when the outbox write fails', async () => {
    const { emitter, outboxService } = createEmitter()
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    outboxService.publish.mockRejectedValue(new Error('database unavailable'))

    expect(() =>
      emitter.emitToLead('lead-1', 'message.created', {})
    ).not.toThrow()
    await flushPromises()

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Could not queue realtime event. target=lead event=message.created error=database unavailable'
    )
  })
})

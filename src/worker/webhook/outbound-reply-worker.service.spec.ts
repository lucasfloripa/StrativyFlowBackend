import { Logger } from '@nestjs/common'

import { OutboundReplyWorker } from './outbound-reply-worker.service'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'

const buildMessage = (data: unknown): RabbitMessage => ({
  eventId: 'outbox-1',
  event: 'message.outbound.send',
  occurredAt: '2026-10-28T12:00:00.000Z',
  data
})

describe('OutboundReplyWorker', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createWorker = (retries?: string) => {
    const rabbitConsumerService = {
      subscribe: jest.fn().mockResolvedValue(undefined)
    }
    const automaticReplyService = {
      deliverQueued: jest.fn().mockResolvedValue('sent')
    }
    const worker = new OutboundReplyWorker(
      rabbitConsumerService as never,
      automaticReplyService as never,
      { get: () => retries } as never
    )

    return { worker, rabbitConsumerService, automaticReplyService }
  }

  it('subscribes to message.outbound.send', async () => {
    const { worker, rabbitConsumerService } = createWorker()

    await worker.onModuleInit()

    expect(rabbitConsumerService.subscribe).toHaveBeenCalledWith({
      queue: 'message.outbound.queue',
      routingKey: 'message.outbound.send',
      handler: expect.any(Function) as unknown
    })
  })

  it.each([
    [undefined, 4],
    ['5', 6],
    ['0', 1],
    ['nope', 4]
  ])(
    'allows 1 + RABBIT_MAX_RETRY_ATTEMPTS (%s) attempts',
    (retries, expected) => {
      expect(createWorker(retries).worker.maxAttempts).toBe(expected)
    }
  )

  it('delivers the queued reply', async () => {
    const { worker, automaticReplyService } = createWorker()

    await worker.handle(buildMessage({ messageId: 'reply-1' }))

    expect(automaticReplyService.deliverQueued).toHaveBeenCalledWith(
      'reply-1',
      4
    )
  })

  it('rethrows a send failure so RabbitMQ retries it', async () => {
    const { worker, automaticReplyService } = createWorker()
    automaticReplyService.deliverQueued.mockRejectedValue(new Error('HTTP 503'))

    await expect(
      worker.handle(buildMessage({ messageId: 'reply-1' }))
    ).rejects.toThrow('HTTP 503')
  })

  it.each([null, {}, { messageId: '' }, { messageId: 1 }])(
    'drops a message whose data is %j',
    async (data) => {
      const { worker, automaticReplyService } = createWorker()
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await worker.handle(buildMessage(data))

      expect(automaticReplyService.deliverQueued).not.toHaveBeenCalled()
    }
  )
})

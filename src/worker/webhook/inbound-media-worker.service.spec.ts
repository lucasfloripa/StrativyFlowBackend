import { Logger } from '@nestjs/common'

import { InboundMediaWorker } from './inbound-media-worker.service'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'

const buildMessage = (data: unknown): RabbitMessage => ({
  eventId: 'outbox-1',
  event: 'message.media.fetch',
  occurredAt: '2026-10-28T12:00:00.000Z',
  data
})

describe('InboundMediaWorker', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createWorker = () => {
    const rabbitConsumerService = {
      subscribe: jest.fn().mockResolvedValue(undefined)
    }
    const inboundMediaService = {
      fetchQueued: jest.fn().mockResolvedValue('stored')
    }
    const worker = new InboundMediaWorker(
      rabbitConsumerService as never,
      inboundMediaService as never,
      { get: () => '2' } as never
    )

    return { worker, rabbitConsumerService, inboundMediaService }
  }

  it('subscribes to message.media.fetch', async () => {
    const { worker, rabbitConsumerService } = createWorker()

    await worker.onModuleInit()

    expect(rabbitConsumerService.subscribe).toHaveBeenCalledWith({
      queue: 'message.media.queue',
      routingKey: 'message.media.fetch',
      handler: expect.any(Function) as unknown
    })
  })

  it('fetches the media of the message with the configured attempts', async () => {
    const { worker, inboundMediaService } = createWorker()

    await worker.handle(buildMessage({ messageId: 'message-1' }))

    expect(inboundMediaService.fetchQueued).toHaveBeenCalledWith('message-1', 3)
  })

  it('rethrows a download failure so RabbitMQ retries it', async () => {
    const { worker, inboundMediaService } = createWorker()
    inboundMediaService.fetchQueued.mockRejectedValue(new Error('ETIMEDOUT'))

    await expect(
      worker.handle(buildMessage({ messageId: 'message-1' }))
    ).rejects.toThrow('ETIMEDOUT')
  })

  it.each([null, {}, { messageId: ' ' }])(
    'drops a message whose data is %j',
    async (data) => {
      const { worker, inboundMediaService } = createWorker()
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await worker.handle(buildMessage(data))

      expect(inboundMediaService.fetchQueued).not.toHaveBeenCalled()
    }
  )
})

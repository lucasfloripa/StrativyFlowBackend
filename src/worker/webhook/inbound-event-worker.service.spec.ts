import { Logger } from '@nestjs/common'

import { InboundEventStatus } from '../../modules/webhook/inbound/inbound-event.entity'

import { InboundEventWorker } from './inbound-event-worker.service'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'
import type { InboundEvent } from '../../modules/webhook/inbound/inbound-event.types'

const buildMessage = (data: unknown): RabbitMessage => ({
  eventId: 'outbox-1',
  event: 'webhook.inbound',
  occurredAt: '2026-10-28T12:00:00.000Z',
  data
})

describe('InboundEventWorker', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createWorker = () => {
    const rabbitConsumerService = {
      subscribe: jest.fn().mockResolvedValue(undefined)
    }
    const inboundEventInbox = {
      processStored: jest.fn().mockResolvedValue(InboundEventStatus.PROCESSED)
    }
    const webhookService = {
      processInboundEvent: jest
        .fn()
        .mockResolvedValue({ status: InboundEventStatus.PROCESSED })
    }
    const worker = new InboundEventWorker(
      rabbitConsumerService as never,
      inboundEventInbox as never,
      webhookService as never,
      { get: () => undefined } as never
    )

    return { worker, rabbitConsumerService, inboundEventInbox, webhookService }
  }

  describe('onModuleInit', () => {
    it('subscribes to webhook.inbound on a durable queue with retries', async () => {
      const { worker, rabbitConsumerService } = createWorker()

      await worker.onModuleInit()

      expect(rabbitConsumerService.subscribe).toHaveBeenCalledWith({
        queue: 'webhook.inbound.queue',
        routingKey: 'webhook.inbound',
        handler: expect.any(Function) as unknown
      })
    })
  })

  describe('handle', () => {
    it('processes the stored event through the webhook service', async () => {
      const { worker, inboundEventInbox, webhookService } = createWorker()
      const event = { dedupeKey: 'wamid.1' } as InboundEvent

      await worker.handle(buildMessage({ inboundEventId: 'inbound-1' }))

      expect(inboundEventInbox.processStored).toHaveBeenCalledWith(
        'inbound-1',
        expect.any(Function),
        { maxAttempts: 4 }
      )
      const [, handler] = inboundEventInbox.processStored.mock.calls[0] as [
        string,
        (stored: InboundEvent) => Promise<unknown>
      ]
      await handler(event)
      expect(webhookService.processInboundEvent).toHaveBeenCalledWith(event)
    })

    it('rethrows a processing error so RabbitMQ retries it', async () => {
      const { worker, inboundEventInbox } = createWorker()
      inboundEventInbox.processStored.mockRejectedValue(
        new Error('Graph API timeout')
      )

      await expect(
        worker.handle(buildMessage({ inboundEventId: 'inbound-1' }))
      ).rejects.toThrow('Graph API timeout')
    })

    it.each([
      null,
      'inbound-1',
      {},
      { inboundEventId: '  ' },
      { inboundEventId: 7 }
    ])('drops a message whose data is %j', async (data) => {
      const { worker, inboundEventInbox } = createWorker()
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await expect(worker.handle(buildMessage(data))).resolves.toBeUndefined()
      expect(inboundEventInbox.processStored).not.toHaveBeenCalled()
    })
  })
})

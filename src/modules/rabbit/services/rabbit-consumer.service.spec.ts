import { Logger } from '@nestjs/common'
import { ConfirmChannel, ConsumeMessage } from 'amqplib'

import {
  RABBIT_DEAD_LETTER_EXCHANGE,
  RABBIT_RETRY_EXCHANGE
} from '../constants/rabbit.constants'
import { RabbitMessage } from '../interfaces/rabbit-message.interface'
import { RabbitSubscription } from '../interfaces/rabbit-subscription.interface'

import { RabbitConsumerService } from './rabbit-consumer.service'

type Publish = (
  exchange: string,
  routingKey: string,
  content: Buffer,
  options?: Record<string, unknown>
) => Promise<boolean>

interface ConsumerHarness {
  confirmChannel: {
    ack: jest.Mock
    nack: jest.Mock
    cancel: jest.Mock
    assertExchange: jest.Mock
    assertQueue: jest.Mock
    bindQueue: jest.Mock
    consume: jest.Mock
    prefetch: jest.Mock
  }
  publish: jest.MockedFunction<Publish>
  service: RabbitConsumerService
  consume: (message: ConsumeMessage) => Promise<void>
}

const messageBody: RabbitMessage = {
  eventId: 'event-id',
  event: 'payment.mark_overdue',
  occurredAt: '2026-09-28T00:00:00.000Z',
  data: { paymentId: 'payment-id' }
}

const createRawMessage = (
  retryCount = 0,
  content = Buffer.from(JSON.stringify(messageBody))
): ConsumeMessage =>
  ({
    content,
    properties: { headers: { 'x-retry-count': retryCount } },
    fields: { routingKey: 'payment.mark_overdue' }
  }) as ConsumeMessage

const createHarness = async (
  handler: RabbitSubscription['handler'] = jest
    .fn()
    .mockResolvedValue(undefined),
  queue = 'payment.queue',
  routingKey = 'payment.mark_overdue'
): Promise<ConsumerHarness> => {
  let consumeHandler: ((message: ConsumeMessage | null) => void) | undefined
  let processing: Promise<void> | undefined
  const confirmChannel = {
    ack: jest.fn(),
    nack: jest.fn(),
    cancel: jest.fn().mockResolvedValue(undefined),
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(
      (_queue: string, callback: (message: ConsumeMessage | null) => void) => {
        consumeHandler = (message) => {
          callback(message)
          processing = new Promise((resolve) => setImmediate(resolve))
        }

        return Promise.resolve({ consumerTag: 'consumer-tag' })
      }
    )
  }
  const publish: jest.MockedFunction<Publish> = jest.fn()
  publish.mockResolvedValue(true)
  const channelWrapper = {
    publish,
    addSetup: jest.fn(
      async (setup: (channel: ConfirmChannel) => Promise<void>) => {
        await setup(confirmChannel as unknown as ConfirmChannel)
      }
    )
  }
  const service = new RabbitConsumerService({
    getChannel: () => channelWrapper
  } as never)

  await service.subscribe({
    queue,
    routingKey,
    handler
  })

  return {
    confirmChannel,
    publish,
    service,
    consume: async (message) => {
      consumeHandler?.(message)
      await processing
    }
  }
}

describe('RabbitConsumerService', () => {
  it('declares durable retry/DLQ topology and applies prefetch', async () => {
    const { confirmChannel } = await createHarness()

    expect(confirmChannel.prefetch).toHaveBeenCalledWith(10)
    expect(confirmChannel.assertQueue).toHaveBeenCalledWith('payment.queue', {
      durable: true
    })
    expect(confirmChannel.assertQueue).toHaveBeenCalledWith(
      'payment.retry.payment.mark_overdue.1',
      {
        durable: true,
        arguments: {
          'x-message-ttl': 5000,
          'x-dead-letter-exchange': 'strativyflow.events',
          'x-dead-letter-routing-key': 'payment.mark_overdue'
        }
      }
    )
    expect(confirmChannel.assertQueue).toHaveBeenCalledWith(
      'payment.retry.payment.mark_overdue.2',
      {
        durable: true,
        arguments: {
          'x-message-ttl': 30000,
          'x-dead-letter-exchange': 'strativyflow.events',
          'x-dead-letter-routing-key': 'payment.mark_overdue'
        }
      }
    )
    expect(confirmChannel.assertQueue).toHaveBeenCalledWith(
      'payment.retry.payment.mark_overdue.3',
      {
        durable: true,
        arguments: {
          'x-message-ttl': 120000,
          'x-dead-letter-exchange': 'strativyflow.events',
          'x-dead-letter-routing-key': 'payment.mark_overdue'
        }
      }
    )
    expect(confirmChannel.assertQueue).toHaveBeenCalledWith('payment.dlq', {
      durable: true
    })
  })

  it('uses distinct retry queues for routing keys sharing one main queue', async () => {
    const leadCreated = await createHarness(
      undefined,
      'notifications.queue',
      'lead.created'
    )
    const messageReceived = await createHarness(
      undefined,
      'notifications.queue',
      'message.received'
    )

    expect(leadCreated.confirmChannel.assertQueue).toHaveBeenCalledWith(
      'notifications.retry.lead.created.1',
      expect.any(Object)
    )
    expect(messageReceived.confirmChannel.assertQueue).toHaveBeenCalledWith(
      'notifications.retry.message.received.1',
      expect.any(Object)
    )
  })

  it('ACKs only after a successful handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined)
    const { confirmChannel, consume } = await createHarness(handler)

    await consume(createRawMessage())

    expect(handler).toHaveBeenCalledWith(messageBody)
    expect(confirmChannel.ack).toHaveBeenCalledTimes(1)
  })

  it('publishes a failed message to the next retry queue with incremented count', async () => {
    const { confirmChannel, publish, consume } = await createHarness(
      jest.fn().mockRejectedValue(new Error('handler failed'))
    )
    const rawMessage = createRawMessage(0)

    await consume(rawMessage)

    expect(publish).toHaveBeenCalledWith(
      RABBIT_RETRY_EXCHANGE,
      'payment.retry.payment.mark_overdue.1',
      rawMessage.content,
      {
        persistent: true,
        headers: {
          'x-retry-count': 1
        }
      }
    )
    expect(confirmChannel.ack).toHaveBeenCalledWith(rawMessage)
  })

  it('preserves eventId and waits for retry confirmation before ACK', async () => {
    let confirmPublish: ((confirmed: boolean) => void) | undefined
    const { confirmChannel, publish, consume } = await createHarness(
      jest.fn().mockRejectedValue(new Error('handler failed'))
    )
    publish.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          confirmPublish = resolve
        })
    )
    const rawMessage = createRawMessage()
    const processing = consume(rawMessage)

    await Promise.resolve()
    expect(confirmChannel.ack).not.toHaveBeenCalled()
    expect(publish.mock.calls[0][2]).toBe(rawMessage.content)

    confirmPublish?.(true)
    await processing
    expect(confirmChannel.ack).toHaveBeenCalledWith(rawMessage)
  })

  it('requeues without ACK when retry publication fails', async () => {
    const { confirmChannel, publish, consume } = await createHarness(
      jest.fn().mockRejectedValue(new Error('handler failed'))
    )
    publish.mockRejectedValue(new Error('retry publish failed'))

    await consume(createRawMessage())

    expect(confirmChannel.ack).not.toHaveBeenCalled()
    expect(confirmChannel.nack).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      true
    )
  })

  it('publishes to DLQ after three retries and ACKs only after confirmation', async () => {
    let confirmPublish: ((confirmed: boolean) => void) | undefined
    const { confirmChannel, publish, consume } = await createHarness(
      jest.fn().mockRejectedValue(new Error('handler failed'))
    )
    publish.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          confirmPublish = resolve
        })
    )
    const rawMessage = createRawMessage(3)
    const processing = consume(rawMessage)

    await Promise.resolve()
    expect(publish).toHaveBeenCalledWith(
      RABBIT_DEAD_LETTER_EXCHANGE,
      'payment.dlq',
      rawMessage.content,
      {
        persistent: true,
        headers: {
          'x-retry-count': 3
        }
      }
    )
    expect(confirmChannel.ack).not.toHaveBeenCalled()

    confirmPublish?.(true)
    await processing
    expect(confirmChannel.ack).toHaveBeenCalledWith(rawMessage)
  })

  it('requeues without ACK when DLQ publication fails', async () => {
    const { confirmChannel, publish, consume } = await createHarness(
      jest.fn().mockRejectedValue(new Error('handler failed'))
    )
    publish.mockRejectedValue(new Error('DLQ publish failed'))

    await consume(createRawMessage(3))

    expect(confirmChannel.ack).not.toHaveBeenCalled()
    expect(confirmChannel.nack).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      true
    )
  })

  it('applies the retry policy to invalid JSON without a hot requeue', async () => {
    const { confirmChannel, publish, consume } = await createHarness()
    const rawMessage = createRawMessage(0, Buffer.from('{invalid'))

    await consume(rawMessage)

    expect(publish).toHaveBeenCalledWith(
      RABBIT_RETRY_EXCHANGE,
      'payment.retry.payment.mark_overdue.1',
      rawMessage.content,
      {
        persistent: true,
        headers: {
          'x-retry-count': 1
        }
      }
    )
    expect(confirmChannel.ack).toHaveBeenCalledWith(rawMessage)
    expect(confirmChannel.nack).not.toHaveBeenCalled()
  })

  describe('onModuleDestroy', () => {
    const deferred = () => {
      let resolve: () => void = () => undefined
      const promise = new Promise<void>((done) => {
        resolve = done
      })

      return { promise, resolve }
    }

    afterEach(() => {
      delete process.env.RABBIT_SHUTDOWN_TIMEOUT_MS
      jest.restoreAllMocks()
    })

    it('cancels the consumer so no new messages are delivered', async () => {
      const { confirmChannel, service } = await createHarness()

      await service.onModuleDestroy()

      expect(confirmChannel.cancel).toHaveBeenCalledWith('consumer-tag')
    })

    it('waits for an in-flight message to finish and ACK before resolving', async () => {
      const handlerDone = deferred()
      const { confirmChannel, service, consume } = await createHarness(
        jest.fn(() => handlerDone.promise)
      )
      void consume(createRawMessage())
      let shutdownFinished = false

      const shutdown = service.onModuleDestroy().then(() => {
        shutdownFinished = true
      })
      await new Promise((resolve) => setImmediate(resolve))

      expect(shutdownFinished).toBe(false)
      expect(confirmChannel.ack).not.toHaveBeenCalled()

      handlerDone.resolve()
      await shutdown

      expect(confirmChannel.ack).toHaveBeenCalledTimes(1)
    })

    it('stops waiting after RABBIT_SHUTDOWN_TIMEOUT_MS and leaves the message unacked', async () => {
      process.env.RABBIT_SHUTDOWN_TIMEOUT_MS = '20'
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined)
      const { confirmChannel, service, consume } = await createHarness(
        jest.fn(() => new Promise<void>(() => undefined))
      )
      void consume(createRawMessage())

      await service.onModuleDestroy()

      expect(confirmChannel.ack).not.toHaveBeenCalled()
      expect(JSON.stringify(warn.mock.calls)).toContain(
        'shutdown timeout reached'
      )
    })

    it('requeues a message delivered during shutdown without handling it', async () => {
      const handler = jest.fn().mockResolvedValue(undefined)
      const { confirmChannel, service, consume } = await createHarness(handler)
      const rawMessage = createRawMessage()

      await service.onModuleDestroy()
      await consume(rawMessage)

      expect(handler).not.toHaveBeenCalled()
      expect(confirmChannel.nack).toHaveBeenCalledWith(rawMessage, false, true)
    })
  })
})

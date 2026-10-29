import { Logger } from '@nestjs/common'

import { RealtimeBridgeConsumer } from './realtime-bridge.consumer'

import type { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'

const buildMessage = (data: unknown): RabbitMessage => ({
  eventId: 'outbox-1',
  event: 'realtime.emit',
  occurredAt: '2026-10-28T12:00:00.000Z',
  data
})

describe('RealtimeBridgeConsumer', () => {
  afterEach(() => jest.restoreAllMocks())

  const createConsumer = () => {
    const rabbitConsumerService = {
      subscribe: jest.fn().mockResolvedValue(undefined)
    }
    const realtimeService = {
      emitToLead: jest.fn(),
      emitToUser: jest.fn(),
      emitBroadcast: jest.fn()
    }
    const consumer = new RealtimeBridgeConsumer(
      rabbitConsumerService as never,
      realtimeService as never
    )

    return { consumer, rabbitConsumerService, realtimeService }
  }

  describe('onApplicationBootstrap', () => {
    it('subscribes to realtime.emit with a queue exclusive to this instance', async () => {
      const { consumer, rabbitConsumerService } = createConsumer()
      const other = createConsumer().consumer

      await consumer.onApplicationBootstrap()

      expect(rabbitConsumerService.subscribe).toHaveBeenCalledWith({
        queue: consumer.queue,
        routingKey: 'realtime.emit',
        exclusive: true,
        handler: expect.any(Function) as unknown
      })
      expect(consumer.queue).toMatch(/^realtime\.emit\..+\.[0-9a-f]{8}$/)
      expect(consumer.queue).not.toBe(other.queue)
    })
  })

  describe('handle', () => {
    it('emits a lead event through the gateway', async () => {
      const { consumer, realtimeService } = createConsumer()

      await consumer.handle(
        buildMessage({
          target: 'lead',
          leadId: 'lead-1',
          event: 'message.created',
          payload: { id: 'message-1' }
        })
      )

      expect(realtimeService.emitToLead).toHaveBeenCalledWith(
        'lead-1',
        'message.created',
        { id: 'message-1' }
      )
    })

    it('emits user and broadcast events', async () => {
      const { consumer, realtimeService } = createConsumer()

      await consumer.handle(
        buildMessage({
          target: 'user',
          userId: 'user-1',
          event: 'notification.created',
          payload: 1
        })
      )
      await consumer.handle(
        buildMessage({ target: 'broadcast', event: 'ping', payload: 2 })
      )

      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification.created',
        1
      )
      expect(realtimeService.emitBroadcast).toHaveBeenCalledWith('ping', 2)
    })

    it('ignores a malformed message without emitting', async () => {
      const { consumer, realtimeService } = createConsumer()
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await expect(
        consumer.handle(buildMessage({ target: 'lead', event: 'x' }))
      ).resolves.toBeUndefined()

      expect(realtimeService.emitToLead).not.toHaveBeenCalled()
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        'Ignoring malformed realtime.emit message. eventId=outbox-1'
      )
    })
  })
})

import { Logger } from '@nestjs/common'

import {
  OutboxMessage,
  OutboxMessageStatus
} from '../entities/outbox-message.entity'

import { OutboxService } from './outbox.service'

import type { EntityManager, Repository } from 'typeorm'

const UUID = /^[0-9a-f-]{36}$/

describe('OutboxService', () => {
  afterEach(() => jest.restoreAllMocks())

  const createService = () => {
    const outboxRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [] })
    }
    const outboxRelayService = {
      relayPending: jest.fn().mockResolvedValue({ published: 1, failed: 0 })
    }
    const service = new OutboxService(
      outboxRepo as unknown as Repository<OutboxMessage>,
      outboxRelayService as never
    )

    return { service, outboxRepo, outboxRelayService }
  }

  describe('enqueue', () => {
    it('writes one pending row per item and returns their IDs', async () => {
      const { service, outboxRepo } = createService()

      const ids = await service.enqueue([
        { routingKey: 'lead.created', payload: { leadId: 'lead-1' } },
        { routingKey: 'message.received', payload: { messageId: 'm-1' } }
      ])

      expect(ids).toHaveLength(2)
      expect(ids[0]).toMatch(UUID)
      expect(ids[0]).not.toBe(ids[1])
      expect(outboxRepo.insert).toHaveBeenCalledWith([
        {
          id: ids[0],
          routingKey: 'lead.created',
          payload: { leadId: 'lead-1' },
          status: OutboxMessageStatus.PENDING
        },
        {
          id: ids[1],
          routingKey: 'message.received',
          payload: { messageId: 'm-1' },
          status: OutboxMessageStatus.PENDING
        }
      ])
    })

    it('writes through the transaction manager when one is given', async () => {
      const { service, outboxRepo } = createService()
      const transactionalRepo = { insert: jest.fn().mockResolvedValue({}) }
      const manager = {
        getRepository: jest.fn().mockReturnValue(transactionalRepo)
      }

      await service.enqueue(
        [{ routingKey: 'lead.created', payload: {} }],
        manager as unknown as EntityManager
      )

      expect(manager.getRepository).toHaveBeenCalledWith(OutboxMessage)
      expect(transactionalRepo.insert).toHaveBeenCalledTimes(1)
      expect(outboxRepo.insert).not.toHaveBeenCalled()
    })

    it('writes nothing for an empty list', async () => {
      const { service, outboxRepo } = createService()

      await expect(service.enqueue([])).resolves.toEqual([])
      expect(outboxRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe('publish', () => {
    // Regression P6: a RabbitMQ failure used to lose the event (dual write).
    it('keeps the event in the outbox when the immediate publish fails', async () => {
      const { service, outboxRepo, outboxRelayService } = createService()
      outboxRelayService.relayPending.mockRejectedValue(
        new Error('connection refused')
      )
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await expect(
        service.publish('lead.created', { leadId: 'lead-1' })
      ).resolves.toBeUndefined()

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1)
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('the relay will retry')
      )
    })

    it('writes the row first and then dispatches exactly that row', async () => {
      const { service, outboxRepo, outboxRelayService } = createService()

      await service.publish('message.received', { messageId: 'm-1' })

      const [[rows]] = outboxRepo.insert.mock.calls as [[Array<{ id: string }>]]
      expect(outboxRelayService.relayPending).toHaveBeenCalledWith({
        ids: [rows[0].id]
      })
      expect(outboxRepo.insert.mock.invocationCallOrder[0]).toBeLessThan(
        outboxRelayService.relayPending.mock.invocationCallOrder[0]
      )
    })

    it('fails when the outbox row cannot be written', async () => {
      const { service, outboxRepo, outboxRelayService } = createService()
      outboxRepo.insert.mockRejectedValue(new Error('database unavailable'))

      await expect(
        service.publish('lead.created', { leadId: 'lead-1' })
      ).rejects.toThrow('database unavailable')
      expect(outboxRelayService.relayPending).not.toHaveBeenCalled()
    })
  })
})

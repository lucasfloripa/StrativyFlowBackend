import { Logger } from '@nestjs/common'

import {
  OutboxMessage,
  OutboxMessageStatus
} from '../entities/outbox-message.entity'

import {
  OUTBOX_MAX_BACKOFF_MS,
  OUTBOX_RELAY_BATCH_SIZE,
  outboxBackoffMs,
  OutboxRelayService
} from './outbox-relay.service'

import type { DataSource } from 'typeorm'

const FIXED_NOW = new Date('2026-10-28T12:00:00.000Z')

const buildRow = (overrides: Partial<OutboxMessage> = {}): OutboxMessage =>
  Object.assign(new OutboxMessage(), {
    id: 'outbox-1',
    routingKey: 'lead.created',
    payload: { leadId: 'lead-1' },
    status: OutboxMessageStatus.PENDING,
    attempts: 0,
    availableAt: new Date('2026-10-28T11:59:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-10-28T11:59:00.000Z'),
    publishedAt: null,
    ...overrides
  })

type QueryCall = { method: string; args: unknown[] }

const createDataSource = (rows: OutboxMessage[]) => {
  const calls: QueryCall[] = []
  const builder: Record<string, unknown> = {}
  for (const method of [
    'setLock',
    'setOnLocked',
    'where',
    'andWhere',
    'orderBy',
    'limit'
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  builder.getMany = jest.fn().mockResolvedValue(rows)

  const manager = {
    createQueryBuilder: jest.fn(() => builder),
    update: jest.fn().mockResolvedValue({ affected: 1 })
  }
  const dataSource = {
    transaction: jest.fn(
      (work: (transactionManager: typeof manager) => Promise<unknown>) =>
        work(manager)
    )
  }

  return { dataSource, manager, calls }
}

describe('OutboxRelayService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const createService = (rows: OutboxMessage[]) => {
    const { dataSource, manager, calls } = createDataSource(rows)
    const rabbitPublisherService = {
      publish: jest.fn().mockResolvedValue(undefined)
    }
    const service = new OutboxRelayService(
      dataSource as unknown as DataSource,
      rabbitPublisherService as never
    )

    return { service, dataSource, manager, calls, rabbitPublisherService }
  }

  describe('relayPending', () => {
    it('locks due pending rows with SKIP LOCKED, oldest first', async () => {
      const { service, manager, calls } = createService([])

      await expect(service.relayPending()).resolves.toEqual({
        published: 0,
        failed: 0
      })

      expect(manager.createQueryBuilder).toHaveBeenCalledWith(
        OutboxMessage,
        'outbox'
      )
      expect(calls).toEqual([
        { method: 'setLock', args: ['pessimistic_write'] },
        { method: 'setOnLocked', args: ['skip_locked'] },
        {
          method: 'where',
          args: [
            'outbox.status = :pending',
            { pending: OutboxMessageStatus.PENDING }
          ]
        },
        { method: 'andWhere', args: ['outbox.availableAt <= now()'] },
        { method: 'orderBy', args: ['outbox.createdAt', 'ASC'] },
        { method: 'limit', args: [OUTBOX_RELAY_BATCH_SIZE] }
      ])
    })

    it('restricts the batch to the given IDs', async () => {
      const { service, calls } = createService([])

      await service.relayPending({ ids: ['outbox-1', 'outbox-2'], limit: 2 })

      expect(calls).toContainEqual({
        method: 'andWhere',
        args: ['outbox.id IN (:...ids)', { ids: ['outbox-1', 'outbox-2'] }]
      })
      expect(calls).toContainEqual({ method: 'limit', args: [2] })
    })

    it('does not open a transaction for an empty ID list', async () => {
      const { service, dataSource } = createService([])

      await expect(service.relayPending({ ids: [] })).resolves.toEqual({
        published: 0,
        failed: 0
      })
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('publishes each row with its ID as event ID and marks it published', async () => {
      const row = buildRow()
      const { service, manager, rabbitPublisherService } = createService([row])

      await expect(service.relayPending()).resolves.toEqual({
        published: 1,
        failed: 0
      })

      expect(rabbitPublisherService.publish).toHaveBeenCalledWith(
        'lead.created',
        { leadId: 'lead-1' },
        { eventId: 'outbox-1', occurredAt: '2026-10-28T11:59:00.000Z' }
      )
      expect(manager.update).toHaveBeenCalledWith(
        OutboxMessage,
        { id: 'outbox-1' },
        {
          status: OutboxMessageStatus.PUBLISHED,
          attempts: 1,
          publishedAt: FIXED_NOW,
          lastError: null
        }
      )
    })

    it('keeps a failed row pending with backoff and the error, and goes on', async () => {
      const failing = buildRow({ id: 'outbox-1', attempts: 2 })
      const next = buildRow({ id: 'outbox-2', routingKey: 'message.received' })
      const { service, manager, rabbitPublisherService } = createService([
        failing,
        next
      ])
      rabbitPublisherService.publish
        .mockRejectedValueOnce(new Error('channel closed'))
        .mockResolvedValueOnce(undefined)

      await expect(service.relayPending()).resolves.toEqual({
        published: 1,
        failed: 1
      })

      expect(manager.update).toHaveBeenCalledWith(
        OutboxMessage,
        { id: 'outbox-1' },
        {
          attempts: 3,
          availableAt: new Date(FIXED_NOW.getTime() + 4_000),
          lastError: 'channel closed'
        }
      )
      expect(manager.update).toHaveBeenCalledWith(
        OutboxMessage,
        { id: 'outbox-2' },
        expect.objectContaining({ status: OutboxMessageStatus.PUBLISHED })
      )
    })
  })

  describe('outboxBackoffMs', () => {
    it.each([
      [1, 1_000],
      [2, 2_000],
      [3, 4_000],
      [9, 256_000],
      [10, OUTBOX_MAX_BACKOFF_MS],
      [50, OUTBOX_MAX_BACKOFF_MS]
    ])('waits %i attempt(s) → %i ms', (attempts, expected) => {
      expect(outboxBackoffMs(attempts)).toBe(expected)
    })
  })
})

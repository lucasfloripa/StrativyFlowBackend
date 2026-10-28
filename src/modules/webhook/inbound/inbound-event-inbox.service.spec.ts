import { Logger } from '@nestjs/common'

import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import { DeferredInboundEventError } from './deferred-inbound-event.error'
import {
  InboundEventInboxService,
  STALE_PROCESSING_MS
} from './inbound-event-inbox.service'
import { InboundEventRecord, InboundEventStatus } from './inbound-event.entity'
import { InboundEventKind } from './inbound-event.types'

import type { InboundEvent } from './inbound-event.types'
import type { OutboxService } from '../../outbox/services/outbox.service'
import type { Brackets, DataSource, Repository } from 'typeorm'

const FIXED_NOW = new Date('2026-10-28T12:00:00.000Z')

const buildEvent = (): InboundEvent => ({
  channel: LeadChannel.WHATSAPP,
  kind: InboundEventKind.MESSAGE,
  dedupeKey: 'wamid.1',
  externalAccountId: 'phone-number-1',
  externalUserId: '5548984296447',
  conversationKey: 'whatsapp:phone-number-1:5548984296447',
  occurredAt: new Date('2026-08-18T18:40:49.000Z'),
  payload: {
    message: { id: 'wamid.1', from: '5548984296447', type: 'text' }
  }
})

type QueryCall = { method: string; args: unknown[] }

/** Chainable stand-in for TypeORM's query builder; `execute` is scripted. */
const createQueryBuilderFake = (results: Array<{ raw: unknown }>) => {
  const builders: QueryCall[][] = []

  const createQueryBuilder = jest.fn(() => {
    const calls: QueryCall[] = []
    builders.push(calls)
    const builder: Record<string, unknown> = {}
    for (const method of [
      'insert',
      'into',
      'values',
      'orIgnore',
      'returning',
      'update',
      'set',
      'where',
      'andWhere'
    ]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return builder
      }
    }
    builder.execute = jest.fn(() => {
      const next = results.shift()
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next ?? { raw: [] })
    })
    return builder
  })

  return { createQueryBuilder, builders }
}

const argsOf = (calls: QueryCall[], method: string) =>
  calls.find((call) => call.method === method)?.args

describe('InboundEventInboxService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const createService = (
    results: Array<{ raw: unknown } | Error>,
    existing?: Partial<InboundEventRecord> | null
  ) => {
    const { createQueryBuilder, builders } = createQueryBuilderFake(
      results as Array<{ raw: unknown }>
    )
    const inboundEventRepo = {
      createQueryBuilder,
      findOne: jest.fn().mockResolvedValue(existing ?? null),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const transactionRepo = {
      findOne: jest.fn().mockResolvedValue(existing ?? null)
    }
    const manager: Record<string, unknown> & {
      query: jest.Mock
      getRepository: jest.Mock
      update: jest.Mock
    } = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue(transactionRepo),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const events: string[] = []
    const dataSource = {
      transaction: async (work: (m: typeof manager) => Promise<unknown>) => {
        events.push('begin')
        try {
          const result = await work(manager)
          events.push('commit')
          return result
        } catch (error) {
          events.push('rollback')
          throw error
        }
      }
    }
    manager.connection = dataSource as never
    const outboxService = {
      publish: jest.fn(() => {
        events.push('outbox')
        return Promise.resolve()
      })
    }
    const service = new InboundEventInboxService(
      inboundEventRepo as unknown as Repository<InboundEventRecord>,
      dataSource as unknown as DataSource,
      outboxService as unknown as OutboxService
    )

    return {
      service,
      inboundEventRepo,
      builders,
      manager,
      transactionRepo,
      outboxService,
      events
    }
  }

  describe('run', () => {
    it('records a new event as processing, runs the handler and marks it processed', async () => {
      const { service, inboundEventRepo, builders } = createService([
        { raw: [{ id: 'inbound-1' }] }
      ])
      const handler = jest.fn().mockResolvedValue({ status: 'ok' })

      await expect(
        service.run(buildEvent(), handler, () => ({
          status: InboundEventStatus.PROCESSED
        }))
      ).resolves.toEqual({ claimed: true, result: { status: 'ok' } })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(argsOf(builders[0], 'into')).toEqual([InboundEventRecord])
      expect(argsOf(builders[0], 'values')?.[0]).toMatchObject({
        channel: LeadChannel.WHATSAPP,
        kind: InboundEventKind.MESSAGE,
        dedupeKey: 'wamid.1',
        conversationKey: 'whatsapp:phone-number-1:5548984296447',
        payload: buildEvent().payload,
        status: InboundEventStatus.PROCESSING,
        attempts: 1
      })
      expect(builders[0].map((call) => call.method)).toContain('orIgnore')
      expect(inboundEventRepo.findOne).not.toHaveBeenCalled()
      expect(inboundEventRepo.update).toHaveBeenCalledWith(
        { id: 'inbound-1' },
        {
          status: InboundEventStatus.PROCESSED,
          lastError: null,
          processedAt: FIXED_NOW
        }
      )
    })

    it('records the reason when the handler ignores the event', async () => {
      const { service, inboundEventRepo } = createService([
        { raw: [{ id: 'inbound-1' }] }
      ])

      await service.run(
        buildEvent(),
        () => Promise.resolve('skipped'),
        () => ({
          status: InboundEventStatus.IGNORED,
          reason: 'ignored_missing_company'
        })
      )

      expect(inboundEventRepo.update).toHaveBeenCalledWith(
        { id: 'inbound-1' },
        {
          status: InboundEventStatus.IGNORED,
          lastError: 'ignored_missing_company',
          processedAt: FIXED_NOW
        }
      )
    })

    // Regression P2: a processing error used to be swallowed without a trace.
    it('marks the event failed with the error and rethrows it', async () => {
      const { service, inboundEventRepo } = createService([
        { raw: [{ id: 'inbound-1' }] }
      ])
      const failure = new Error('Graph API timeout')

      await expect(
        service.run(
          buildEvent(),
          () => Promise.reject(failure),
          () => ({ status: InboundEventStatus.PROCESSED })
        )
      ).rejects.toBe(failure)

      expect(inboundEventRepo.update).toHaveBeenCalledWith(
        { id: 'inbound-1' },
        {
          status: InboundEventStatus.FAILED,
          lastError: 'Graph API timeout',
          processedAt: null
        }
      )
    })

    it.each([
      InboundEventStatus.PROCESSED,
      InboundEventStatus.IGNORED,
      InboundEventStatus.PROCESSING
    ])(
      'skips a repeated delivery of an event that is %s',
      async (currentStatus) => {
        const { service, inboundEventRepo } = createService(
          [{ raw: [] }, { raw: [] }],
          { id: 'inbound-1', status: currentStatus }
        )
        const handler = jest.fn()

        await expect(
          service.run(buildEvent(), handler, () => ({
            status: InboundEventStatus.PROCESSED
          }))
        ).resolves.toEqual({ claimed: false, currentStatus })

        expect(handler).not.toHaveBeenCalled()
        expect(inboundEventRepo.findOne).toHaveBeenCalledWith({
          where: { channel: LeadChannel.WHATSAPP, dedupeKey: 'wamid.1' },
          select: { id: true, status: true }
        })
        expect(inboundEventRepo.update).not.toHaveBeenCalled()
      }
    )

    it('reclaims a failed or abandoned (processing for over 5 min) event and processes it again', async () => {
      const { service, inboundEventRepo, builders } = createService(
        [{ raw: [] }, { raw: [{ id: 'inbound-1' }] }],
        { id: 'inbound-1', status: InboundEventStatus.FAILED }
      )
      const handler = jest.fn().mockResolvedValue('done')

      await expect(
        service.run(buildEvent(), handler, () => ({
          status: InboundEventStatus.PROCESSED
        }))
      ).resolves.toEqual({ claimed: true, result: 'done' })

      const reclaim = builders[1]
      expect(argsOf(reclaim, 'set')?.[0]).toMatchObject({
        status: InboundEventStatus.PROCESSING,
        lastError: null
      })
      expect(argsOf(reclaim, 'where')).toEqual([
        'id = :id',
        { id: 'inbound-1' }
      ])
      const [brackets] = argsOf(reclaim, 'andWhere') as [Brackets]
      const conditions: unknown[][] = []
      const bracketQuery = {
        where: (...args: unknown[]) => {
          conditions.push(args)
          return bracketQuery
        },
        orWhere: (...args: unknown[]) => {
          conditions.push(args)
          return bracketQuery
        }
      }
      brackets.whereFactory(bracketQuery as never)
      expect(conditions).toEqual([
        [
          'status IN (:...retryable)',
          {
            retryable: [InboundEventStatus.PENDING, InboundEventStatus.FAILED]
          }
        ],
        [
          'status = :processing AND "lastAttemptAt" < :staleBefore',
          {
            processing: InboundEventStatus.PROCESSING,
            staleBefore: new Date(FIXED_NOW.getTime() - STALE_PROCESSING_MS)
          }
        ]
      ])
      expect(handler).toHaveBeenCalledTimes(1)
      expect(inboundEventRepo.update).toHaveBeenCalledWith(
        { id: 'inbound-1' },
        expect.objectContaining({ status: InboundEventStatus.PROCESSED })
      )
    })

    it('still processes the event when the inbox cannot be written', async () => {
      const { service, inboundEventRepo } = createService([
        new Error('relation "inbound_events" does not exist')
      ])
      const handler = jest.fn().mockResolvedValue('done')

      await expect(
        service.run(buildEvent(), handler, () => ({
          status: InboundEventStatus.PROCESSED
        }))
      ).resolves.toEqual({ claimed: true, result: 'done' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(inboundEventRepo.update).not.toHaveBeenCalled()
    })

    it('keeps the handler result when the outcome cannot be recorded', async () => {
      const { service, inboundEventRepo } = createService([
        { raw: [{ id: 'inbound-1' }] }
      ])
      inboundEventRepo.update.mockRejectedValue(new Error('connection lost'))

      await expect(
        service.run(
          buildEvent(),
          () => Promise.resolve('done'),
          () => ({ status: InboundEventStatus.PROCESSED })
        )
      ).resolves.toEqual({ claimed: true, result: 'done' })
    })

    it('truncates long error messages', async () => {
      const { service, inboundEventRepo } = createService([
        { raw: [{ id: 'inbound-1' }] }
      ])

      await expect(
        service.run(
          buildEvent(),
          () => Promise.reject(new Error('x'.repeat(5000))),
          () => ({ status: InboundEventStatus.PROCESSED })
        )
      ).rejects.toThrow()

      const [, update] = inboundEventRepo.update.mock.calls[0] as [
        unknown,
        { lastError: string }
      ]
      expect(update.lastError).toHaveLength(2000)
    })
  })

  describe('accept', () => {
    it('stores new events as pending and queues one job per event in one transaction', async () => {
      const { service, builders, outboxService, events } = createService([
        { raw: [{ id: 'inbound-1' }] },
        { raw: [] },
        { raw: [{ id: 'inbound-3' }] }
      ])

      await expect(
        service.accept([buildEvent(), buildEvent(), buildEvent()])
      ).resolves.toEqual({ accepted: 2, duplicates: 1 })

      expect(argsOf(builders[0], 'values')?.[0]).toMatchObject({
        dedupeKey: 'wamid.1',
        status: InboundEventStatus.PENDING,
        attempts: 0
      })
      expect(builders[0].map((call) => call.method)).toContain('orIgnore')
      expect(outboxService.publish).toHaveBeenCalledTimes(2)
      expect(outboxService.publish).toHaveBeenCalledWith('webhook.inbound', {
        inboundEventId: 'inbound-1'
      })
      expect(outboxService.publish).toHaveBeenCalledWith('webhook.inbound', {
        inboundEventId: 'inbound-3'
      })
      expect(events).toEqual(['begin', 'outbox', 'outbox', 'commit'])
    })

    it('fails (so Meta redelivers) when the events cannot be stored', async () => {
      const { service, events } = createService([
        new Error('database unavailable')
      ])

      await expect(service.accept([buildEvent()])).rejects.toThrow(
        'database unavailable'
      )
      expect(events).toEqual(['begin', 'rollback'])
    })

    it('does nothing for an empty batch', async () => {
      const { service, events } = createService([])

      await expect(service.accept([])).resolves.toEqual({
        accepted: 0,
        duplicates: 0
      })
      expect(events).toEqual([])
    })
  })

  describe('processStored', () => {
    const stored = (overrides: Partial<InboundEventRecord> = {}) =>
      Object.assign(new InboundEventRecord(), {
        id: 'inbound-1',
        ...buildEvent(),
        status: InboundEventStatus.PENDING,
        attempts: 0,
        ...overrides
      })

    it('locks the conversation and the row, runs the handler and records the outcome in the same transaction', async () => {
      const record = stored()
      const { service, manager, transactionRepo, events } = createService(
        [],
        record
      )
      const handler = jest.fn(() => {
        events.push('handler')
        return Promise.resolve({
          status: InboundEventStatus.PROCESSED
        } as const)
      })

      await expect(service.processStored('inbound-1', handler)).resolves.toBe(
        InboundEventStatus.PROCESSED
      )

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['whatsapp:phone-number-1:5548984296447']
      )
      expect(transactionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'inbound-1' },
        lock: { mode: 'pessimistic_write' }
      })
      expect(handler).toHaveBeenCalledWith(buildEvent())
      expect(manager.update).toHaveBeenCalledWith(
        InboundEventRecord,
        { id: 'inbound-1' },
        {
          status: InboundEventStatus.PROCESSED,
          lastError: null,
          attempts: 1,
          lastAttemptAt: FIXED_NOW,
          processedAt: FIXED_NOW
        }
      )
      expect(events).toEqual(['begin', 'handler', 'commit'])
    })

    it('records why an event was ignored', async () => {
      const { service, manager } = createService([], stored())

      await service.processStored('inbound-1', () =>
        Promise.resolve({
          status: InboundEventStatus.IGNORED,
          reason: 'missing_company'
        })
      )

      expect(manager.update).toHaveBeenCalledWith(
        InboundEventRecord,
        { id: 'inbound-1' },
        expect.objectContaining({
          status: InboundEventStatus.IGNORED,
          lastError: 'missing_company'
        })
      )
    })

    it('skips the conversation lock when the event has no conversation', async () => {
      const { service, manager } = createService(
        [],
        stored({ conversationKey: null })
      )

      await service.processStored('inbound-1', () =>
        Promise.resolve({ status: InboundEventStatus.PROCESSED })
      )

      expect(manager.query).not.toHaveBeenCalled()
    })

    it.each([InboundEventStatus.PROCESSED, InboundEventStatus.IGNORED])(
      'does not run the handler again for an event already %s',
      async (status) => {
        const { service, events } = createService([], stored({ status }))
        const handler = jest.fn()

        await expect(service.processStored('inbound-1', handler)).resolves.toBe(
          'already_handled'
        )
        expect(handler).not.toHaveBeenCalled()
        expect(events).toEqual([])
      }
    )

    it('does not run the handler when another worker finished it while this one waited for the lock', async () => {
      const { service, transactionRepo } = createService([], stored())
      transactionRepo.findOne.mockResolvedValue(
        stored({ status: InboundEventStatus.PROCESSED })
      )
      const handler = jest.fn()

      await expect(service.processStored('inbound-1', handler)).resolves.toBe(
        'already_handled'
      )
      expect(handler).not.toHaveBeenCalled()
    })

    it('rolls back, marks the event failed and rethrows for a RabbitMQ retry', async () => {
      const { service, inboundEventRepo, manager, events } = createService(
        [],
        stored({ status: InboundEventStatus.FAILED, attempts: 1 })
      )
      const failure = new Error('Graph API timeout')

      await expect(
        service.processStored('inbound-1', () => Promise.reject(failure))
      ).rejects.toBe(failure)

      expect(events).toEqual(['begin', 'rollback'])
      expect(manager.update).not.toHaveBeenCalled()
      const [criteria, update] = inboundEventRepo.update.mock.calls[0] as [
        unknown,
        Record<string, unknown>
      ]
      expect(criteria).toEqual({ id: 'inbound-1' })
      expect(update).toMatchObject({
        status: InboundEventStatus.FAILED,
        lastError: 'Graph API timeout',
        lastAttemptAt: FIXED_NOW,
        processedAt: null
      })
      expect((update.attempts as () => string)()).toBe('"attempts" + 1')
    })

    it('retries a deferred event like any failure while attempts remain', async () => {
      const { service, inboundEventRepo } = createService(
        [],
        stored({ attempts: 1 })
      )
      const deferred = new DeferredInboundEventError('status_target_not_found')

      await expect(
        service.processStored('inbound-1', () => Promise.reject(deferred), {
          maxAttempts: 4
        })
      ).rejects.toBe(deferred)
      expect(inboundEventRepo.update).toHaveBeenCalledWith(
        { id: 'inbound-1' },
        expect.objectContaining({ status: InboundEventStatus.FAILED })
      )
    })

    it('records a deferred event as ignored on the last attempt', async () => {
      const { service, inboundEventRepo } = createService(
        [],
        stored({ attempts: 3 })
      )

      await expect(
        service.processStored(
          'inbound-1',
          () =>
            Promise.reject(
              new DeferredInboundEventError('status_target_not_found')
            ),
          { maxAttempts: 4 }
        )
      ).resolves.toBe(InboundEventStatus.IGNORED)

      const [, update] = inboundEventRepo.update.mock.calls[0] as [
        unknown,
        Record<string, unknown>
      ]
      expect(update).toMatchObject({
        status: InboundEventStatus.IGNORED,
        lastError: 'status_target_not_found',
        processedAt: FIXED_NOW
      })
    })

    it('still fails a regular error on the last attempt', async () => {
      const { service } = createService([], stored({ attempts: 3 }))

      await expect(
        service.processStored(
          'inbound-1',
          () => Promise.reject(new Error('bug')),
          { maxAttempts: 4 }
        )
      ).rejects.toThrow('bug')
    })

    it('reports a missing event without failing', async () => {
      const { service } = createService([], null)
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

      await expect(
        service.processStored('inbound-404', jest.fn())
      ).resolves.toBe('missing')
    })
  })
})

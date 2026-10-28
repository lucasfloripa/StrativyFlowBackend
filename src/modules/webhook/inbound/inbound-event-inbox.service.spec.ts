import { Logger } from '@nestjs/common'

import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import {
  InboundEventInboxService,
  STALE_PROCESSING_MS
} from './inbound-event-inbox.service'
import { InboundEventRecord, InboundEventStatus } from './inbound-event.entity'
import { InboundEventKind } from './inbound-event.types'

import type { InboundEvent } from './inbound-event.types'
import type { Brackets, Repository } from 'typeorm'

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
    const service = new InboundEventInboxService(
      inboundEventRepo as unknown as Repository<InboundEventRecord>
    )

    return { service, inboundEventRepo, builders }
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
})

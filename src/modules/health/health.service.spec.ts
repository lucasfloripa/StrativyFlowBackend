import { Logger } from '@nestjs/common'

import { HealthService } from './health.service'

import type { DataSource } from 'typeorm'

const FIXED_NOW = new Date('2026-10-29T12:00:00.000Z')

describe('HealthService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(FIXED_NOW))
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const createService = (counts: {
    inboundPending?: number
    inboundFailed?: number
    outboxPending?: number
  }) => {
    const query = jest.fn((sql: string) => {
      const count = sql.includes('outbox_messages')
        ? counts.outboxPending
        : sql.includes("'failed'")
          ? counts.inboundFailed
          : counts.inboundPending
      return Promise.resolve([{ count: String(count ?? 0) }])
    })
    const service = new HealthService({ query } as unknown as DataSource)

    return { service, query }
  }

  describe('check', () => {
    it('is ok when nothing waits for more than 5 minutes', async () => {
      const { service, query } = createService({ inboundFailed: 2 })

      await expect(service.check()).resolves.toEqual({
        status: 'ok',
        database: 'up',
        webhookPipeline: {
          stalePendingInboundEvents: 0,
          failedInboundEvents: 2,
          stalePendingOutboxMessages: 0
        }
      })
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`"status" = 'pending' AND "receivedAt" < $1`),
        [new Date('2026-10-29T11:55:00.000Z')]
      )
    })

    it.each([
      ['webhook events', { inboundPending: 3 }],
      ['outbox messages', { outboxPending: 1 }]
    ])('is degraded when %s pile up', async (_label, counts) => {
      const { service } = createService(counts)

      await expect(service.check()).resolves.toMatchObject({
        status: 'degraded',
        database: 'up'
      })
    })

    it('is down when the database does not answer', async () => {
      const { service, query } = createService({})
      query.mockRejectedValue(new Error('connect ECONNREFUSED'))
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      await expect(service.check()).resolves.toEqual({
        status: 'down',
        database: 'down'
      })
    })
  })
})

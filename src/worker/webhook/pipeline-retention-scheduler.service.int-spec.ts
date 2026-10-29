import { CreateInboundEvents1793232000000 } from '../../database/migrations/1793232000000-CreateInboundEvents'
import { CreateOutboxMessages1793235600000 } from '../../database/migrations/1793235600000-CreateOutboxMessages'
import { LeadChannel } from '../../modules/leads/entities/lead-channel-identity.entity'
import {
  OutboxMessage,
  OutboxMessageStatus
} from '../../modules/outbox/entities/outbox-message.entity'
import {
  InboundEventRecord,
  InboundEventStatus
} from '../../modules/webhook/inbound/inbound-event.entity'
import { InboundEventKind } from '../../modules/webhook/inbound/inbound-event.types'
import {
  createIntegrationDatabase,
  describeWithDatabase
} from '../../testing/integration-database'

import { PipelineRetentionScheduler } from './pipeline-retention-scheduler.service'

import type { DataSource } from 'typeorm'

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

describeWithDatabase('PipelineRetentionScheduler (Postgres)', () => {
  let dataSource: DataSource
  let destroy: () => Promise<void>

  beforeAll(async () => {
    const database = await createIntegrationDatabase({
      entities: [InboundEventRecord, OutboxMessage],
      migrations: [
        CreateInboundEvents1793232000000,
        CreateOutboxMessages1793235600000
      ]
    })
    dataSource = database.dataSource
    destroy = database.destroy
  })

  afterAll(() => destroy())

  const inboundEvent = (
    dedupeKey: string,
    status: InboundEventStatus,
    processedAt: Date | null
  ) => ({
    channel: LeadChannel.WHATSAPP,
    kind: InboundEventKind.MESSAGE,
    dedupeKey,
    payload: {},
    status,
    processedAt
  })

  describe('purge', () => {
    it('deletes old handled events and published messages, and keeps the rest', async () => {
      await dataSource
        .getRepository(InboundEventRecord)
        .insert([
          inboundEvent(
            'old-processed',
            InboundEventStatus.PROCESSED,
            daysAgo(31)
          ),
          inboundEvent('old-ignored', InboundEventStatus.IGNORED, daysAgo(40)),
          inboundEvent('recent', InboundEventStatus.PROCESSED, daysAgo(5)),
          inboundEvent('old-failed', InboundEventStatus.FAILED, null),
          inboundEvent('old-pending', InboundEventStatus.PENDING, null)
        ])
      await dataSource.getRepository(OutboxMessage).insert([
        {
          id: crypto.randomUUID(),
          routingKey: 'old.published',
          payload: {},
          status: OutboxMessageStatus.PUBLISHED,
          publishedAt: daysAgo(8)
        },
        {
          id: crypto.randomUUID(),
          routingKey: 'recent.published',
          payload: {},
          status: OutboxMessageStatus.PUBLISHED,
          publishedAt: daysAgo(1)
        },
        {
          id: crypto.randomUUID(),
          routingKey: 'still.pending',
          payload: {},
          status: OutboxMessageStatus.PENDING
        }
      ])
      const scheduler = new PipelineRetentionScheduler(dataSource, {
        get: () => undefined
      } as never)

      await expect(scheduler.purge()).resolves.toEqual({
        inboundEvents: 2,
        outboxMessages: 1
      })

      const remainingEvents = await dataSource
        .getRepository(InboundEventRecord)
        .find({ order: { dedupeKey: 'ASC' } })
      expect(remainingEvents.map((event) => event.dedupeKey)).toEqual([
        'old-failed',
        'old-pending',
        'recent'
      ])
      const remainingOutbox = await dataSource
        .getRepository(OutboxMessage)
        .find({ order: { routingKey: 'ASC' } })
      expect(remainingOutbox.map((row) => row.routingKey)).toEqual([
        'recent.published',
        'still.pending'
      ])
    })
  })
})

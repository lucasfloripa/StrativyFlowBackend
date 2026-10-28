import { CreateInboundEvents1793232000000 } from '../../../database/migrations/1793232000000-CreateInboundEvents'
import { CreateOutboxMessages1793235600000 } from '../../../database/migrations/1793235600000-CreateOutboxMessages'
import {
  createIntegrationDatabase,
  describeWithDatabase
} from '../../../testing/integration-database'
import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'
import {
  OutboxMessage,
  OutboxMessageStatus
} from '../../outbox/entities/outbox-message.entity'
import { OutboxRelayService } from '../../outbox/services/outbox-relay.service'
import { OutboxService } from '../../outbox/services/outbox.service'

import { DeferredInboundEventError } from './deferred-inbound-event.error'
import { InboundEventInboxService } from './inbound-event-inbox.service'
import { InboundEventRecord, InboundEventStatus } from './inbound-event.entity'
import { InboundEventKind } from './inbound-event.types'

import type { InboundEvent } from './inbound-event.types'
import type { DataSource } from 'typeorm'

const event = (dedupeKey: string, user = '5548984296447'): InboundEvent => ({
  channel: LeadChannel.WHATSAPP,
  kind: InboundEventKind.MESSAGE,
  dedupeKey,
  externalAccountId: 'phone-number-1',
  externalUserId: user,
  conversationKey: `whatsapp:phone-number-1:${user}`,
  occurredAt: new Date('2026-10-28T12:00:00.000Z'),
  payload: { message: { id: dedupeKey, from: user, type: 'text' } }
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describeWithDatabase('inbound pipeline (Postgres)', () => {
  let dataSource: DataSource
  let destroy: () => Promise<void>
  let published: Array<{ routingKey: string; payload: unknown }>
  let inbox: InboundEventInboxService
  let relay: OutboxRelayService

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

    const rabbitPublisher = {
      publish: (routingKey: string, payload: unknown) => {
        published.push({ routingKey, payload })
        return Promise.resolve()
      }
    }
    relay = new OutboxRelayService(dataSource, rabbitPublisher as never)
    const outbox = new OutboxService(
      dataSource.getRepository(OutboxMessage),
      relay
    )
    inbox = new InboundEventInboxService(
      dataSource.getRepository(InboundEventRecord),
      dataSource,
      outbox
    )
  })

  afterAll(() => destroy())

  beforeEach(async () => {
    published = []
    await dataSource.getRepository(InboundEventRecord).clear()
    await dataSource.getRepository(OutboxMessage).clear()
  })

  describe('accept (fast-ack)', () => {
    it('stores each event once and publishes one job per new event after COMMIT', async () => {
      await expect(
        inbox.accept([event('wamid.1'), event('wamid.2')])
      ).resolves.toEqual({ accepted: 2, duplicates: 0 })
      // Meta redelivers the same POST.
      await expect(
        inbox.accept([event('wamid.1'), event('wamid.2')])
      ).resolves.toEqual({ accepted: 0, duplicates: 2 })

      const stored = await dataSource
        .getRepository(InboundEventRecord)
        .find({ order: { dedupeKey: 'ASC' } })
      expect(stored.map((row) => [row.dedupeKey, row.status])).toEqual([
        ['wamid.1', InboundEventStatus.PENDING],
        ['wamid.2', InboundEventStatus.PENDING]
      ])
      expect(published).toEqual([
        {
          routingKey: 'webhook.inbound',
          payload: { inboundEventId: stored[0].id }
        },
        {
          routingKey: 'webhook.inbound',
          payload: { inboundEventId: stored[1].id }
        }
      ])
      const outboxRows = await dataSource.getRepository(OutboxMessage).find()
      expect(outboxRows.map((row) => row.status)).toEqual([
        OutboxMessageStatus.PUBLISHED,
        OutboxMessageStatus.PUBLISHED
      ])
    })
  })

  describe('processStored (worker)', () => {
    const storeOne = async (dedupeKey: string, user?: string) => {
      await inbox.accept([event(dedupeKey, user)])
      const row = await dataSource
        .getRepository(InboundEventRecord)
        .findOneByOrFail({ dedupeKey })
      return row.id
    }

    // Regression P7: two events of one conversation used to run in parallel.
    it('runs events of the same conversation one at a time', async () => {
      const first = await storeOne('wamid.1')
      const second = await storeOne('wamid.2')
      const timeline: string[] = []
      const handler = (name: string) => async () => {
        timeline.push(`${name}:start`)
        await sleep(150)
        timeline.push(`${name}:end`)
        return { status: InboundEventStatus.PROCESSED } as const
      }

      await Promise.all([
        inbox.processStored(first, handler('a')),
        inbox.processStored(second, handler('b'))
      ])

      expect([
        ['a:start', 'a:end', 'b:start', 'b:end'],
        ['b:start', 'b:end', 'a:start', 'a:end']
      ]).toContainEqual(timeline)
    })

    it('runs events of different conversations in parallel', async () => {
      const first = await storeOne('wamid.1', '5548000000001')
      const second = await storeOne('wamid.2', '5548000000002')
      const timeline: string[] = []
      const handler = (name: string) => async () => {
        timeline.push(`${name}:start`)
        await sleep(150)
        timeline.push(`${name}:end`)
        return { status: InboundEventStatus.PROCESSED } as const
      }

      await Promise.all([
        inbox.processStored(first, handler('a')),
        inbox.processStored(second, handler('b'))
      ])

      expect(timeline.slice(0, 2).sort()).toEqual(['a:start', 'b:start'])
    })

    // Regression P4: a redelivered message could be processed twice.
    it('processes a message delivered twice at the same time only once', async () => {
      const id = await storeOne('wamid.1')
      const handler = jest.fn(async () => {
        await sleep(100)
        return { status: InboundEventStatus.PROCESSED } as const
      })

      const results = await Promise.all([
        inbox.processStored(id, handler),
        inbox.processStored(id, handler)
      ])

      expect(handler).toHaveBeenCalledTimes(1)
      expect(results.sort()).toEqual(['already_handled', 'processed'])
    })

    it('rolls back what the handler wrote and keeps the event failed for a retry', async () => {
      const id = await storeOne('wamid.1')
      const outbox = dataSource.getRepository(OutboxMessage)
      const before = await outbox.count()

      await expect(
        inbox.processStored(id, async () => {
          // Written through an injected repository inside the transaction.
          await outbox.insert({
            id: crypto.randomUUID(),
            routingKey: 'lead.created',
            payload: {}
          })
          throw new Error('Graph API timeout')
        })
      ).rejects.toThrow('Graph API timeout')

      expect(await outbox.count()).toBe(before)
      const failed = await dataSource
        .getRepository(InboundEventRecord)
        .findOneByOrFail({ id })
      expect(failed).toMatchObject({
        status: InboundEventStatus.FAILED,
        lastError: 'Graph API timeout',
        attempts: 1
      })

      // The retry succeeds and records the outcome.
      await expect(
        inbox.processStored(id, () =>
          Promise.resolve({
            status: InboundEventStatus.IGNORED,
            reason: 'missing_company'
          })
        )
      ).resolves.toBe(InboundEventStatus.IGNORED)
      expect(
        await dataSource
          .getRepository(InboundEventRecord)
          .findOneByOrFail({ id })
      ).toMatchObject({
        status: InboundEventStatus.IGNORED,
        lastError: 'missing_company',
        attempts: 2
      })
    })
  })

  describe('deferred events (P8)', () => {
    it('retries a status whose message is not there yet and gives up as ignored', async () => {
      await inbox.accept([event('wamid.status')])
      const { id } = await dataSource
        .getRepository(InboundEventRecord)
        .findOneByOrFail({ dedupeKey: 'wamid.status' })
      const notYet = () =>
        Promise.reject(new DeferredInboundEventError('status_target_not_found'))

      for (let attempt = 1; attempt < 3; attempt += 1) {
        await expect(
          inbox.processStored(id, notYet, { maxAttempts: 3 })
        ).rejects.toBeInstanceOf(DeferredInboundEventError)
      }
      await expect(
        inbox.processStored(id, notYet, { maxAttempts: 3 })
      ).resolves.toBe(InboundEventStatus.IGNORED)

      expect(
        await dataSource
          .getRepository(InboundEventRecord)
          .findOneByOrFail({ id })
      ).toMatchObject({
        status: InboundEventStatus.IGNORED,
        lastError: 'status_target_not_found',
        attempts: 3
      })
    })
  })

  describe('outbox relay', () => {
    it('publishes each pending row once when relays run concurrently', async () => {
      const outbox = dataSource.getRepository(OutboxMessage)
      await outbox.insert(
        Array.from({ length: 30 }, (_, index) => ({
          id: crypto.randomUUID(),
          routingKey: `test.${index}`,
          payload: { index }
        }))
      )

      const results = await Promise.all([
        relay.relayPending({ limit: 30 }),
        relay.relayPending({ limit: 30 }),
        relay.relayPending({ limit: 30 })
      ])

      expect(results.reduce((sum, result) => sum + result.published, 0)).toBe(
        30
      )
      expect(new Set(published.map((item) => item.routingKey)).size).toBe(30)
      expect(published).toHaveLength(30)
    })
  })
})

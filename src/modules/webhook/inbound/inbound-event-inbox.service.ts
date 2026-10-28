import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { Brackets, DataSource, Repository } from 'typeorm'

import { runInTransaction } from '../../../database/transaction-context'
import { OutboxService } from '../../outbox/services/outbox.service'

import { DeferredInboundEventError } from './deferred-inbound-event.error'
import {
  WEBHOOK_INBOUND_ROUTING_KEY,
  type WebhookInboundJob
} from './inbound-event.constants'
import { InboundEventRecord, InboundEventStatus } from './inbound-event.entity'

import type { InboundEvent } from './inbound-event.types'

/** A `processing` row older than this is treated as abandoned (crash). */
export const STALE_PROCESSING_MS = 5 * 60_000

const MAX_ERROR_LENGTH = 2000

export type InboxOutcome =
  | { status: InboundEventStatus.PROCESSED; note?: string }
  | { status: InboundEventStatus.IGNORED; reason: string }

export type InboxRunResult<T> =
  | { claimed: true; result: T }
  | { claimed: false; currentStatus: InboundEventStatus }

type Claim =
  | { kind: 'claimed'; id: string }
  | { kind: 'taken'; id: string; status: InboundEventStatus }
  | { kind: 'untracked' }

type ReturningRow = { id: string }

export type AcceptResult = { accepted: number; duplicates: number }

export type StoredEventResult =
  | InboundEventStatus.PROCESSED
  | InboundEventStatus.IGNORED
  | 'already_handled'
  | 'missing'

const FINAL_STATUSES = [
  InboundEventStatus.PROCESSED,
  InboundEventStatus.IGNORED
]

/**
 * Transactional inbox for Meta webhook events. Every event is recorded in
 * `inbound_events` before it is processed, and claimed atomically, so a
 * repeated delivery of something already processed (or being processed) is
 * skipped and a failure stays visible as `failed` instead of disappearing.
 */
@Injectable()
export class InboundEventInboxService {
  private readonly logger = new Logger(InboundEventInboxService.name)

  constructor(
    @InjectRepository(InboundEventRecord)
    private readonly inboundEventRepo: Repository<InboundEventRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService
  ) {}

  /**
   * Fast-ack path: stores each new event as `pending` and, in the same
   * transaction, asks the worker to process it (`webhook.inbound` through the
   * outbox). A repeated delivery is counted as a duplicate. Throws if the
   * events cannot be stored, so Meta redelivers.
   */
  async accept(events: InboundEvent[]): Promise<AcceptResult> {
    if (events.length === 0) {
      return { accepted: 0, duplicates: 0 }
    }

    return runInTransaction(this.dataSource, async () => {
      const result: AcceptResult = { accepted: 0, duplicates: 0 }

      for (const event of events) {
        const inserted = await this.inboundEventRepo
          .createQueryBuilder()
          .insert()
          .into(InboundEventRecord)
          .values({
            ...this.toRow(event),
            status: InboundEventStatus.PENDING,
            attempts: 0
          })
          .orIgnore()
          .returning(['id'])
          .execute()

        const inboundEventId = firstReturnedId(inserted.raw)
        if (!inboundEventId) {
          result.duplicates += 1
          continue
        }

        const job: WebhookInboundJob = { inboundEventId }
        await this.outboxService.publish(WEBHOOK_INBOUND_ROUTING_KEY, job)
        result.accepted += 1
      }

      return result
    })
  }

  /**
   * Worker path: processes a stored event in one transaction that holds the
   * conversation's advisory lock (events of one conversation run one at a
   * time) and a row lock on the event, and records the outcome in that same
   * transaction. A handler error rolls everything back, marks the event
   * `failed` and is rethrown so RabbitMQ retries it.
   */
  async processStored(
    inboundEventId: string,
    handler: (event: InboundEvent) => Promise<InboxOutcome>,
    options: { maxAttempts?: number } = {}
  ): Promise<StoredEventResult> {
    const stored = await this.inboundEventRepo.findOne({
      where: { id: inboundEventId }
    })

    if (!stored) {
      this.logger.warn(
        `Inbound event not found, nothing to process. inboundEventId=${inboundEventId}`
      )
      return 'missing'
    }

    if (FINAL_STATUSES.includes(stored.status)) {
      return 'already_handled'
    }

    try {
      return await runInTransaction(this.dataSource, async (manager) => {
        if (stored.conversationKey) {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            stored.conversationKey
          ])
        }

        const locked = await manager.getRepository(InboundEventRecord).findOne({
          where: { id: inboundEventId },
          lock: { mode: 'pessimistic_write' }
        })

        if (!locked || FINAL_STATUSES.includes(locked.status)) {
          return 'already_handled'
        }

        const outcome = await handler(toInboundEvent(locked))
        const now = new Date()

        await manager.update(
          InboundEventRecord,
          { id: inboundEventId },
          {
            status: outcome.status,
            lastError:
              outcome.status === InboundEventStatus.IGNORED
                ? outcome.reason
                : null,
            attempts: locked.attempts + 1,
            lastAttemptAt: now,
            processedAt: now
          }
        )

        return outcome.status
      })
    } catch (error) {
      if (
        error instanceof DeferredInboundEventError &&
        options.maxAttempts !== undefined &&
        stored.attempts + 1 >= options.maxAttempts
      ) {
        await this.markGivenUp(inboundEventId, error.reason)
        return InboundEventStatus.IGNORED
      }

      await this.markFailed(inboundEventId, error)
      throw error
    }
  }

  /**
   * Claims `event`, runs `handler` and records the outcome. When another
   * delivery already handled or holds the event, `handler` is not called.
   * A `handler` error marks the event `failed` and is rethrown.
   *
   * Shadow mode: if the inbox itself cannot be written, the event is still
   * processed, untracked, so the inbox never blocks the existing flow.
   */
  async run<T>(
    event: InboundEvent,
    handler: () => Promise<T>,
    classify: (result: T) => InboxOutcome
  ): Promise<InboxRunResult<T>> {
    const claim = await this.claim(event)

    if (claim.kind === 'taken') {
      this.logger.log(
        `Inbound event already handled. inboundEventId=${claim.id} channel=${event.channel} kind=${event.kind} status=${claim.status}`
      )
      return { claimed: false, currentStatus: claim.status }
    }

    const id = claim.kind === 'claimed' ? claim.id : null
    let result: T

    try {
      result = await handler()
    } catch (error) {
      await this.finish(id, {
        status: InboundEventStatus.FAILED,
        lastError: describeError(error)
      })
      throw error
    }

    const outcome = classify(result)
    await this.finish(id, {
      status: outcome.status,
      lastError:
        outcome.status === InboundEventStatus.IGNORED ? outcome.reason : null
    })

    return { claimed: true, result }
  }

  private async claim(event: InboundEvent): Promise<Claim> {
    try {
      const inserted = await this.inboundEventRepo
        .createQueryBuilder()
        .insert()
        .into(InboundEventRecord)
        .values({
          ...this.toRow(event),
          status: InboundEventStatus.PROCESSING,
          attempts: 1,
          lastAttemptAt: () => 'now()'
        })
        .orIgnore()
        .returning(['id'])
        .execute()

      const insertedId = firstReturnedId(inserted.raw)
      if (insertedId) {
        return { kind: 'claimed', id: insertedId }
      }

      const existing = await this.inboundEventRepo.findOne({
        where: { channel: event.channel, dedupeKey: event.dedupeKey },
        select: { id: true, status: true }
      })
      if (!existing) {
        throw new Error('inbound event vanished after a conflicting insert')
      }

      const reclaimed = await this.inboundEventRepo
        .createQueryBuilder()
        .update(InboundEventRecord)
        .set({
          status: InboundEventStatus.PROCESSING,
          attempts: () => '"attempts" + 1',
          lastAttemptAt: () => 'now()',
          lastError: null
        })
        .where('id = :id', { id: existing.id })
        .andWhere(
          new Brackets((query) => {
            query
              .where('status IN (:...retryable)', {
                retryable: [
                  InboundEventStatus.PENDING,
                  InboundEventStatus.FAILED
                ]
              })
              .orWhere(
                'status = :processing AND "lastAttemptAt" < :staleBefore',
                {
                  processing: InboundEventStatus.PROCESSING,
                  staleBefore: new Date(Date.now() - STALE_PROCESSING_MS)
                }
              )
          })
        )
        .returning(['id'])
        .execute()

      return firstReturnedId(reclaimed.raw)
        ? { kind: 'claimed', id: existing.id }
        : { kind: 'taken', id: existing.id, status: existing.status }
    } catch (error) {
      this.logger.error(
        `Inbound event inbox unavailable, processing untracked. channel=${event.channel} kind=${event.kind} error=${describeError(error)}`
      )
      return { kind: 'untracked' }
    }
  }

  private toRow(event: InboundEvent) {
    return {
      channel: event.channel,
      kind: event.kind,
      dedupeKey: event.dedupeKey,
      externalAccountId: event.externalAccountId,
      externalUserId: event.externalUserId,
      conversationKey: event.conversationKey,
      occurredAt: event.occurredAt,
      payload: event.payload
    }
  }

  /** A deferred event that never became applicable: done, with the reason. */
  private async markGivenUp(id: string, reason: string): Promise<void> {
    const now = new Date()

    await this.inboundEventRepo.update(
      { id },
      {
        status: InboundEventStatus.IGNORED,
        lastError: reason,
        attempts: () => '"attempts" + 1',
        lastAttemptAt: now,
        processedAt: now
      }
    )
  }

  private async markFailed(id: string, error: unknown): Promise<void> {
    try {
      await this.inboundEventRepo.update(
        { id },
        {
          status: InboundEventStatus.FAILED,
          lastError: describeError(error),
          attempts: () => '"attempts" + 1',
          lastAttemptAt: new Date(),
          processedAt: null
        }
      )
    } catch (updateError) {
      this.logger.error(
        `Could not mark inbound event failed. inboundEventId=${id} error=${describeError(updateError)}`
      )
    }
  }

  private async finish(
    id: string | null,
    update: { status: InboundEventStatus; lastError: string | null }
  ): Promise<void> {
    if (!id) {
      return
    }

    try {
      await this.inboundEventRepo.update(
        { id },
        {
          status: update.status,
          lastError: update.lastError,
          processedAt:
            update.status === InboundEventStatus.FAILED ? null : new Date()
        }
      )
    } catch (error) {
      this.logger.error(
        `Could not record inbound event outcome. inboundEventId=${id} status=${update.status} error=${describeError(error)}`
      )
    }
  }
}

/** Rebuilds the normalized event the webhook handlers expect. */
export function toInboundEvent(record: InboundEventRecord): InboundEvent {
  return {
    channel: record.channel,
    kind: record.kind,
    dedupeKey: record.dedupeKey,
    externalAccountId: record.externalAccountId,
    externalUserId: record.externalUserId,
    conversationKey: record.conversationKey,
    occurredAt: record.occurredAt,
    payload: record.payload
  } as InboundEvent
}

function firstReturnedId(raw: unknown): string | null {
  if (!Array.isArray(raw)) {
    return null
  }

  const [row] = raw as Array<Partial<ReturningRow> | undefined>
  return typeof row?.id === 'string' ? row.id : null
}

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_LENGTH)
}

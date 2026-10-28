import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'

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
    private readonly inboundEventRepo: Repository<InboundEventRecord>
  ) {}

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
          channel: event.channel,
          kind: event.kind,
          dedupeKey: event.dedupeKey,
          externalAccountId: event.externalAccountId,
          externalUserId: event.externalUserId,
          conversationKey: event.conversationKey,
          occurredAt: event.occurredAt,
          payload: event.payload,
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

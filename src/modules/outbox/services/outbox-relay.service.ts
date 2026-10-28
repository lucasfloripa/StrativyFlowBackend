import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'

import { RabbitPublisherService } from '../../rabbit/services/rabbit-publisher.service'
import {
  OutboxMessage,
  OutboxMessageStatus
} from '../entities/outbox-message.entity'

export const OUTBOX_RELAY_BATCH_SIZE = 100
const OUTBOX_BASE_BACKOFF_MS = 1_000
export const OUTBOX_MAX_BACKOFF_MS = 5 * 60_000
const MAX_ERROR_LENGTH = 2000

export type OutboxRelayResult = { published: number; failed: number }

/** 1 s, 2 s, 4 s ... capped at 5 min, for the n-th failed attempt. */
export const outboxBackoffMs = (attempts: number): number =>
  Math.min(
    OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0),
    OUTBOX_MAX_BACKOFF_MS
  )

/**
 * Publishes pending outbox rows to RabbitMQ. Rows are locked with
 * `FOR UPDATE SKIP LOCKED`, so the API and any number of workers can relay
 * at the same time without publishing a row twice.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rabbitPublisherService: RabbitPublisherService
  ) {}

  /** Relays due pending rows; with `ids`, only those rows. */
  async relayPending(
    options: { ids?: string[]; limit?: number } = {}
  ): Promise<OutboxRelayResult> {
    if (options.ids && options.ids.length === 0) {
      return { published: 0, failed: 0 }
    }

    return this.dataSource.transaction(async (manager) => {
      const rows = await this.lockDueRows(manager, options)
      const result: OutboxRelayResult = { published: 0, failed: 0 }

      for (const row of rows) {
        if (await this.publishRow(manager, row)) {
          result.published += 1
        } else {
          result.failed += 1
        }
      }

      return result
    })
  }

  private lockDueRows(
    manager: EntityManager,
    options: { ids?: string[]; limit?: number }
  ): Promise<OutboxMessage[]> {
    const query = manager
      .createQueryBuilder(OutboxMessage, 'outbox')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .where('outbox.status = :pending', {
        pending: OutboxMessageStatus.PENDING
      })
      .andWhere('outbox.availableAt <= now()')

    if (options.ids) {
      query.andWhere('outbox.id IN (:...ids)', { ids: options.ids })
    }

    return query
      .orderBy('outbox.createdAt', 'ASC')
      .limit(options.limit ?? OUTBOX_RELAY_BATCH_SIZE)
      .getMany()
  }

  private async publishRow(
    manager: EntityManager,
    row: OutboxMessage
  ): Promise<boolean> {
    try {
      await this.rabbitPublisherService.publish(row.routingKey, row.payload, {
        eventId: row.id,
        occurredAt: row.createdAt.toISOString()
      })
    } catch (error) {
      const attempts = row.attempts + 1
      const message = error instanceof Error ? error.message : String(error)

      await manager.update(
        OutboxMessage,
        { id: row.id },
        {
          attempts,
          availableAt: new Date(Date.now() + outboxBackoffMs(attempts)),
          lastError: message.slice(0, MAX_ERROR_LENGTH)
        }
      )
      this.logger.warn(
        `Outbox publish failed, will retry. outboxMessageId=${row.id} routingKey=${row.routingKey} attempts=${attempts} error=${message}`
      )
      return false
    }

    await manager.update(
      OutboxMessage,
      { id: row.id },
      {
        status: OutboxMessageStatus.PUBLISHED,
        attempts: row.attempts + 1,
        publishedAt: new Date(),
        lastError: null
      }
    )
    return true
  }
}

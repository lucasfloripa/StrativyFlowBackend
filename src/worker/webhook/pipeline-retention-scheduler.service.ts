import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { OutboxMessage } from '../../modules/outbox/entities/outbox-message.entity'
import {
  InboundEventRecord,
  InboundEventStatus
} from '../../modules/webhook/inbound/inbound-event.entity'

export const DEFAULT_INBOUND_EVENTS_RETENTION_DAYS = 30
export const DEFAULT_OUTBOX_RETENTION_DAYS = 7
export const RETENTION_DELETE_BATCH = 1_000

const DAY_MS = 24 * 60 * 60 * 1_000

export type RetentionResult = {
  inboundEvents: number
  outboxMessages: number
}

const positiveDays = (value: string | undefined, fallback: number): number => {
  const days = Number(value)
  return Number.isInteger(days) && days > 0 ? days : fallback
}

/**
 * Daily purge of the webhook pipeline tables. `inbound_events` keeps the raw
 * Meta payload (phone numbers, message text: personal data under LGPD), so
 * handled events are deleted after `INBOUND_EVENTS_RETENTION_DAYS` (30);
 * published outbox rows after `OUTBOX_RETENTION_DAYS` (7). `failed` and
 * `pending` rows stay until someone resolves them. Deletes run in batches to
 * keep locks short.
 */
@Injectable()
export class PipelineRetentionScheduler {
  private readonly logger = new Logger(PipelineRetentionScheduler.name)
  readonly inboundEventsRetentionDays: number
  readonly outboxRetentionDays: number

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService
  ) {
    this.inboundEventsRetentionDays = positiveDays(
      configService.get<string>('INBOUND_EVENTS_RETENTION_DAYS'),
      DEFAULT_INBOUND_EVENTS_RETENTION_DAYS
    )
    this.outboxRetentionDays = positiveDays(
      configService.get<string>('OUTBOX_RETENTION_DAYS'),
      DEFAULT_OUTBOX_RETENTION_DAYS
    )
  }

  @Cron('0 30 3 * * *', { waitForCompletion: true })
  async purge(): Promise<RetentionResult> {
    const now = Date.now()
    const result: RetentionResult = {
      inboundEvents: await this.deleteInBatches(
        InboundEventRecord,
        'inbound_events',
        `"status" IN (:...handled) AND "processedAt" < :before`,
        {
          handled: [InboundEventStatus.PROCESSED, InboundEventStatus.IGNORED],
          before: new Date(now - this.inboundEventsRetentionDays * DAY_MS)
        }
      ),
      outboxMessages: await this.deleteInBatches(
        OutboxMessage,
        'outbox_messages',
        `"status" = 'published' AND "publishedAt" < :before`,
        { before: new Date(now - this.outboxRetentionDays * DAY_MS) }
      )
    }

    this.logger.log(
      `Webhook pipeline retention done. inboundEvents=${result.inboundEvents} outboxMessages=${result.outboxMessages}`
    )
    return result
  }

  private async deleteInBatches(
    entity: typeof InboundEventRecord | typeof OutboxMessage,
    table: string,
    condition: string,
    parameters: Record<string, unknown>
  ): Promise<number> {
    let total = 0
    let deleted: number

    do {
      const result = await this.dataSource
        .createQueryBuilder()
        .delete()
        .from(entity)
        .where(
          `"id" IN (SELECT "id" FROM "${table}" WHERE ${condition} LIMIT ${RETENTION_DELETE_BATCH})`,
          parameters
        )
        .execute()
      deleted = result.affected ?? 0
      total += deleted
    } while (deleted === RETENTION_DELETE_BATCH)

    return total
  }
}

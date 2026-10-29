import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

/** Pending work older than this means the pipeline is not keeping up. */
export const STALE_BACKLOG_MS = 5 * 60_000

export type HealthStatus = 'ok' | 'degraded' | 'down'

export type HealthReport = {
  status: HealthStatus
  database: 'up' | 'down'
  webhookPipeline?: {
    stalePendingInboundEvents: number
    failedInboundEvents: number
    stalePendingOutboxMessages: number
  }
}

type CountRow = { count: string | number }

/**
 * `down`: the database does not answer. `degraded`: webhook events or outbox
 * messages pending for over 5 minutes (worker stopped, RabbitMQ down).
 * `failedInboundEvents` is informational: they wait for a replay.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthReport> {
    const staleBefore = new Date(Date.now() - STALE_BACKLOG_MS)

    try {
      const [inboundPending, inboundFailed, outboxPending] = await Promise.all([
        this.count(
          `SELECT count(*) AS count FROM "inbound_events" WHERE "status" = 'pending' AND "receivedAt" < $1`,
          [staleBefore]
        ),
        this.count(
          `SELECT count(*) AS count FROM "inbound_events" WHERE "status" = 'failed'`
        ),
        this.count(
          `SELECT count(*) AS count FROM "outbox_messages" WHERE "status" = 'pending' AND "createdAt" < $1`,
          [staleBefore]
        )
      ])

      return {
        status: inboundPending > 0 || outboxPending > 0 ? 'degraded' : 'ok',
        database: 'up',
        webhookPipeline: {
          stalePendingInboundEvents: inboundPending,
          failedInboundEvents: inboundFailed,
          stalePendingOutboxMessages: outboxPending
        }
      }
    } catch (error) {
      this.logger.error(
        `Health check query failed. error=${error instanceof Error ? error.message : String(error)}`
      )
      return { status: 'down', database: 'down' }
    }
  }

  private async count(sql: string, parameters: unknown[] = []) {
    const [row] = await this.dataSource.query<CountRow[]>(sql, parameters)
    return Number(row?.count ?? 0)
  }
}

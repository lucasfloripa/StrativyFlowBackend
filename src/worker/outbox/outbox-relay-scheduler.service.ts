import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'

import {
  OUTBOX_RELAY_BATCH_SIZE,
  OutboxRelayService
} from '../../modules/outbox/services/outbox-relay.service'

import type { OutboxRelayResult } from '../../modules/outbox/services/outbox-relay.service'

export const OUTBOX_RELAY_INTERVAL_MS = 1_000

/**
 * Polls the outbox every second and publishes what the immediate dispatch
 * missed (RabbitMQ down, process crash after commit). A full batch is
 * followed by another one right away.
 */
@Injectable()
export class OutboxRelayScheduler {
  private readonly logger = new Logger(OutboxRelayScheduler.name)
  private running = false

  constructor(private readonly outboxRelayService: OutboxRelayService) {}

  @Interval(OUTBOX_RELAY_INTERVAL_MS)
  async relay(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    try {
      let batch: OutboxRelayResult
      do {
        batch = await this.outboxRelayService.relayPending({
          limit: OUTBOX_RELAY_BATCH_SIZE
        })
        if (batch.failed > 0) {
          this.logger.warn(
            `Outbox relay batch had failures. published=${batch.published} failed=${batch.failed}`
          )
        }
      } while (
        batch.failed === 0 &&
        batch.published === OUTBOX_RELAY_BATCH_SIZE
      )
    } catch (error) {
      this.logger.error(
        `Outbox relay failed. error=${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.running = false
    }
  }
}

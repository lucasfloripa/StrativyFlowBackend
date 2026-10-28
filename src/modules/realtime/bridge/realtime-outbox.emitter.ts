import { Injectable, Logger } from '@nestjs/common'

import { OutboxService } from '../../outbox/services/outbox.service'

import { REALTIME_EMIT_ROUTING_KEY } from './realtime-bridge.message'

import type { RealtimeEmitter } from '../realtime-emitter'
import type { RealtimeEmitCommand } from './realtime-bridge.message'

/**
 * Worker side of the realtime bridge: the worker has no Socket.IO gateway,
 * so it sends each realtime event to the API through the outbox. Realtime is
 * best effort: a failure is logged and never fails the caller.
 */
@Injectable()
export class RealtimeOutboxEmitter implements RealtimeEmitter {
  private readonly logger = new Logger(RealtimeOutboxEmitter.name)

  constructor(private readonly outboxService: OutboxService) {}

  emitToLead(leadId: string, event: string, payload: unknown): void {
    this.send({ target: 'lead', leadId, event, payload })
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.send({ target: 'user', userId, event, payload })
  }

  emitBroadcast(event: string, payload: unknown): void {
    this.send({ target: 'broadcast', event, payload })
  }

  private send(command: RealtimeEmitCommand): void {
    this.outboxService
      .publish(REALTIME_EMIT_ROUTING_KEY, command)
      .catch((error: unknown) => {
        this.logger.error(
          `Could not queue realtime event. target=${command.target} event=${command.event} error=${error instanceof Error ? error.message : String(error)}`
        )
      })
  }
}

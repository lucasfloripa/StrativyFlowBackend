import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { RabbitConsumerService } from '../../modules/rabbit/services/rabbit-consumer.service'
import { InboundEventInboxService } from '../../modules/webhook/inbound/inbound-event-inbox.service'
import {
  WEBHOOK_INBOUND_QUEUE,
  WEBHOOK_INBOUND_ROUTING_KEY
} from '../../modules/webhook/inbound/inbound-event.constants'
import { WebhookService } from '../../modules/webhook/webhook.service'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'

/**
 * Processes inbound Meta events stored by the webhook fast-ack
 * (`WEBHOOK_ASYNC_PROCESSING`). A handler error is rethrown, so RabbitMQ
 * retries the event (5 s, 30 s, 2 min) and then dead-letters it; the
 * `inbound_events` row stays `failed` with the error.
 */
@Injectable()
export class InboundEventWorker implements OnModuleInit {
  private readonly logger = new Logger(InboundEventWorker.name)

  constructor(
    private readonly rabbitConsumerService: RabbitConsumerService,
    private readonly inboundEventInbox: InboundEventInboxService,
    private readonly webhookService: WebhookService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumerService.subscribe({
      queue: WEBHOOK_INBOUND_QUEUE,
      routingKey: WEBHOOK_INBOUND_ROUTING_KEY,
      handler: (message) => this.handle(message)
    })
  }

  async handle(message: RabbitMessage): Promise<void> {
    const inboundEventId = this.getInboundEventId(message)

    if (!inboundEventId) {
      this.logger.warn(
        `Ignoring webhook.inbound message without inboundEventId. eventId=${message.eventId}`
      )
      return
    }

    const result = await this.inboundEventInbox.processStored(
      inboundEventId,
      (event) => this.webhookService.processInboundEvent(event)
    )

    this.logger.log(
      `Inbound event processed. inboundEventId=${inboundEventId} result=${result}`
    )
  }

  private getInboundEventId(message: RabbitMessage): string | null {
    const data = message.data
    if (typeof data !== 'object' || data === null) {
      return null
    }

    const { inboundEventId } = data as { inboundEventId?: unknown }
    return typeof inboundEventId === 'string' && inboundEventId.trim()
      ? inboundEventId
      : null
  }
}

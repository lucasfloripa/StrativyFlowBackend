import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { InboundEventInboxService } from './inbound/inbound-event-inbox.service'
import { normalizeInstagramWebhook } from './inbound/instagram-inbound.normalizer'
import { normalizeMessengerWebhook } from './inbound/messenger-inbound.normalizer'
import { normalizeWhatsAppWebhook } from './inbound/whatsapp-inbound.normalizer'
import { isWebhookAsyncProcessingEnabled } from './webhook-async.flag'
import { WebhookService } from './webhook.service'

import type {
  InboundEvent,
  NormalizedWebhook
} from './inbound/inbound-event.types'
import type {
  InstagramDirectWebhookPayload,
  MessengerWebhookPayload,
  WhatsAppWebhookPayload
} from './inbound/meta-webhook-payload.types'

/**
 * What the webhook POST does. With `WEBHOOK_ASYNC_PROCESSING=true` it only
 * stores the events and answers 200 (fast-ack); the worker processes them.
 * Otherwise it processes them in the request, as before. Read per request,
 * so turning the flag off is a rollback without a deploy of new code.
 */
@Injectable()
export class WebhookIngestionService {
  private readonly logger = new Logger(WebhookIngestionService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
    private readonly inboundEventInbox: InboundEventInboxService
  ) {}

  isAsyncProcessingEnabled(): boolean {
    return isWebhookAsyncProcessingEnabled(this.configService)
  }

  ingestWhatsApp(payload: WhatsAppWebhookPayload) {
    return this.isAsyncProcessingEnabled()
      ? this.accept('whatsapp', normalizeWhatsAppWebhook(payload))
      : this.webhookService.handleIncomingMessage(payload)
  }

  ingestMessenger(payload: MessengerWebhookPayload) {
    return this.isAsyncProcessingEnabled()
      ? this.accept('messenger', normalizeMessengerWebhook(payload))
      : this.webhookService.handleMessengerWebhook(payload)
  }

  ingestInstagram(payload: InstagramDirectWebhookPayload) {
    return this.isAsyncProcessingEnabled()
      ? this.accept('instagram', normalizeInstagramWebhook(payload))
      : this.webhookService.handleDirectWebhook(payload)
  }

  private async accept(
    channel: string,
    { events, skipped }: NormalizedWebhook<InboundEvent>
  ) {
    const { accepted, duplicates } = await this.inboundEventInbox.accept(events)

    this.logger.log(
      `Webhook accepted for async processing. channel=${channel} accepted=${accepted} duplicates=${duplicates} skipped=${skipped.length}`
    )

    return { status: 'accepted', accepted, duplicates }
  }
}

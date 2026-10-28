import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { rabbitDeliveryAttempts } from '../../modules/rabbit/rabbit-attempts'
import { RabbitConsumerService } from '../../modules/rabbit/services/rabbit-consumer.service'
import {
  MESSAGE_MEDIA_FETCH_ROUTING_KEY,
  MESSAGE_MEDIA_QUEUE
} from '../../modules/webhook/media/inbound-media.constants'
import { InboundMediaService } from '../../modules/webhook/media/inbound-media.service'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'

/**
 * Downloads inbound attachments outside the conversation lock
 * (`message.media.fetch`). A temporary failure is rethrown so RabbitMQ
 * retries it; the last attempt records the error on the message instead.
 */
@Injectable()
export class InboundMediaWorker implements OnModuleInit {
  private readonly logger = new Logger(InboundMediaWorker.name)

  /** The first delivery plus every RabbitMQ retry. */
  readonly maxAttempts: number

  constructor(
    private readonly rabbitConsumerService: RabbitConsumerService,
    private readonly inboundMediaService: InboundMediaService,
    configService: ConfigService
  ) {
    this.maxAttempts = rabbitDeliveryAttempts(configService)
  }

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumerService.subscribe({
      queue: MESSAGE_MEDIA_QUEUE,
      routingKey: MESSAGE_MEDIA_FETCH_ROUTING_KEY,
      handler: (message) => this.handle(message)
    })
  }

  async handle(message: RabbitMessage): Promise<void> {
    const data = message.data
    const messageId =
      typeof data === 'object' && data !== null
        ? (data as { messageId?: unknown }).messageId
        : undefined

    if (typeof messageId !== 'string' || !messageId.trim()) {
      this.logger.warn(
        `Ignoring message.media.fetch without messageId. eventId=${message.eventId}`
      )
      return
    }

    const result = await this.inboundMediaService.fetchQueued(
      messageId,
      this.maxAttempts
    )

    this.logger.log(
      `Inbound media handled. messageId=${messageId} result=${result}`
    )
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS } from '../../modules/rabbit/constants/rabbit.constants'
import { RabbitConsumerService } from '../../modules/rabbit/services/rabbit-consumer.service'
import { AutomaticReplyService } from '../../modules/webhook/outbound/automatic-reply.service'
import {
  MESSAGE_OUTBOUND_QUEUE,
  MESSAGE_OUTBOUND_SEND_ROUTING_KEY
} from '../../modules/webhook/outbound/outbound-reply.constants'

import type { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'

/**
 * Sends queued automatic replies (`message.outbound.send`). A temporary
 * Graph API failure is rethrown so RabbitMQ retries it; the last attempt,
 * or a permanent failure, marks the message `failed` instead.
 */
@Injectable()
export class OutboundReplyWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboundReplyWorker.name)

  /** The first delivery plus every RabbitMQ retry. */
  readonly maxAttempts: number

  constructor(
    private readonly rabbitConsumerService: RabbitConsumerService,
    private readonly automaticReplyService: AutomaticReplyService,
    configService: ConfigService
  ) {
    const retries = Number(
      configService.get<string>('RABBIT_MAX_RETRY_ATTEMPTS')
    )
    this.maxAttempts =
      1 +
      (Number.isInteger(retries) && retries >= 0
        ? retries
        : DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS)
  }

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumerService.subscribe({
      queue: MESSAGE_OUTBOUND_QUEUE,
      routingKey: MESSAGE_OUTBOUND_SEND_ROUTING_KEY,
      handler: (message) => this.handle(message)
    })
  }

  async handle(message: RabbitMessage): Promise<void> {
    const messageId = this.getMessageId(message)

    if (!messageId) {
      this.logger.warn(
        `Ignoring message.outbound.send without messageId. eventId=${message.eventId}`
      )
      return
    }

    const result = await this.automaticReplyService.deliverQueued(
      messageId,
      this.maxAttempts
    )

    this.logger.log(
      `Automatic reply handled. messageId=${messageId} result=${result}`
    )
  }

  private getMessageId(message: RabbitMessage): string | null {
    const data = message.data
    if (typeof data !== 'object' || data === null) {
      return null
    }

    const { messageId } = data as { messageId?: unknown }
    return typeof messageId === 'string' && messageId.trim() ? messageId : null
  }
}

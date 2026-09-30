import { Injectable, Logger } from '@nestjs/common'
import { ChannelWrapper } from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage } from 'amqplib'

import {
  DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS,
  DEFAULT_RABBIT_PREFETCH,
  DEFAULT_RABBIT_RETRY_DELAYS_MS,
  RABBIT_DEAD_LETTER_EXCHANGE,
  RABBIT_EXCHANGE,
  RABBIT_RETRY_EXCHANGE
} from '../constants/rabbit.constants'
import { RabbitMessage } from '../interfaces/rabbit-message.interface'
import { RabbitSubscription } from '../interfaces/rabbit-subscription.interface'

import { RabbitConnectionService } from './rabbit-connection.service'

const RETRY_COUNT_HEADER = 'x-retry-count'

const parseNonNegativeInteger = (
  rawValue: string | undefined,
  fallback: number
): number => {
  const parsedValue = Number(rawValue)

  return Number.isInteger(parsedValue) && parsedValue >= 0
    ? parsedValue
    : fallback
}

const parsePositiveInteger = (
  rawValue: string | undefined,
  fallback: number
): number => {
  const parsedValue = Number(rawValue)

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback
}

const parseRetryDelays = (rawValue: string | undefined): number[] => {
  if (!rawValue) {
    return DEFAULT_RABBIT_RETRY_DELAYS_MS
  }

  const delays = rawValue
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)

  return delays.length > 0 ? delays : DEFAULT_RABBIT_RETRY_DELAYS_MS
}

@Injectable()
export class RabbitConsumerService {
  private readonly logger = new Logger(RabbitConsumerService.name)

  // maxRetryAttempts excludes the original processing attempt.
  private readonly maxRetryAttempts = parseNonNegativeInteger(
    process.env.RABBIT_MAX_RETRY_ATTEMPTS,
    DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS
  )

  private readonly prefetch = parsePositiveInteger(
    process.env.RABBIT_PREFETCH,
    DEFAULT_RABBIT_PREFETCH
  )

  private readonly retryDelays = parseRetryDelays(
    process.env.RABBIT_RETRY_DELAYS_MS
  )

  constructor(
    private readonly rabbitConnectionService: RabbitConnectionService
  ) {}

  async subscribe(options: RabbitSubscription): Promise<void> {
    const channel = this.rabbitConnectionService.getChannel()

    await channel.addSetup(async (confirmChannel: ConfirmChannel) => {
      await this.setupSubscription(confirmChannel, options)

      await confirmChannel.consume(
        options.queue,
        (rawMessage) => {
          void this.handleMessage(channel, confirmChannel, rawMessage, options)
        },
        { noAck: false }
      )
    })
  }

  private async setupSubscription(
    confirmChannel: ConfirmChannel,
    options: RabbitSubscription
  ): Promise<void> {
    await confirmChannel.assertExchange(RABBIT_EXCHANGE, 'topic', {
      durable: true
    })
    await confirmChannel.assertExchange(RABBIT_RETRY_EXCHANGE, 'direct', {
      durable: true
    })
    await confirmChannel.assertExchange(RABBIT_DEAD_LETTER_EXCHANGE, 'direct', {
      durable: true
    })
    await confirmChannel.prefetch(this.prefetch)

    await confirmChannel.assertQueue(options.queue, { durable: true })
    await confirmChannel.bindQueue(
      options.queue,
      RABBIT_EXCHANGE,
      options.routingKey
    )

    for (
      let retryCount = 1;
      retryCount <= this.maxRetryAttempts;
      retryCount += 1
    ) {
      const retryQueue = this.getRetryQueue(
        options.queue,
        options.routingKey,
        retryCount
      )
      await confirmChannel.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': this.getRetryDelay(retryCount),
          'x-dead-letter-exchange': RABBIT_EXCHANGE,
          'x-dead-letter-routing-key': options.routingKey
        }
      })
      await confirmChannel.bindQueue(
        retryQueue,
        RABBIT_RETRY_EXCHANGE,
        retryQueue
      )
    }

    const deadLetterQueue = this.getDeadLetterQueue(options.queue)
    await confirmChannel.assertQueue(deadLetterQueue, { durable: true })
    await confirmChannel.bindQueue(
      deadLetterQueue,
      RABBIT_DEAD_LETTER_EXCHANGE,
      deadLetterQueue
    )
  }

  private async handleMessage(
    channel: ChannelWrapper,
    confirmChannel: ConfirmChannel,
    rawMessage: ConsumeMessage | null,
    options: RabbitSubscription
  ): Promise<void> {
    if (!rawMessage) {
      return
    }

    const retryCount = this.getRetryCount(rawMessage)
    let message: RabbitMessage | undefined

    try {
      message = this.parseMessage(rawMessage)
      this.logger.log(
        `RabbitMQ message received queue=${options.queue} event=${message.event} eventId=${message.eventId} retryCount=${retryCount}`
      )
      await options.handler(message)
      confirmChannel.ack(rawMessage)
    } catch (error) {
      const event = message?.event ?? rawMessage.fields.routingKey
      const eventId = message?.eventId ?? 'unknown'
      this.logger.error(
        `RabbitMQ message processing failed queue=${options.queue} event=${event} eventId=${eventId} retryCount=${retryCount}`,
        error instanceof Error ? error.stack : undefined
      )

      try {
        if (retryCount >= this.maxRetryAttempts) {
          await this.moveToDeadLetterQueue(
            channel,
            rawMessage,
            options,
            retryCount,
            event,
            eventId
          )
        } else {
          await this.scheduleRetry(
            channel,
            rawMessage,
            options,
            retryCount + 1,
            event,
            eventId
          )
        }

        confirmChannel.ack(rawMessage)
      } catch (publishError) {
        this.logger.error(
          `RabbitMQ failed-message routing failed; original requeued queue=${options.queue} event=${event} eventId=${eventId} retryCount=${retryCount}`,
          publishError instanceof Error ? publishError.stack : undefined
        )

        // Exceptional fallback only: normal retries use TTL queues. Requeueing
        // releases the prefetch slot without losing the unconfirmed delivery.
        confirmChannel.nack(rawMessage, false, true)
      }
    }
  }

  private async scheduleRetry(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    options: RabbitSubscription,
    retryCount: number,
    event: string,
    eventId: string
  ): Promise<void> {
    const retryQueue = this.getRetryQueue(
      options.queue,
      options.routingKey,
      retryCount
    )
    const delay = this.getRetryDelay(retryCount)

    await channel.publish(
      RABBIT_RETRY_EXCHANGE,
      retryQueue,
      rawMessage.content,
      this.getPublishOptions(rawMessage, retryCount)
    )

    this.logger.warn(
      `RabbitMQ message scheduled for retry queue=${options.queue} event=${event} eventId=${eventId} retryCount=${retryCount} delay=${delay}`
    )
  }

  private async moveToDeadLetterQueue(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    options: RabbitSubscription,
    retryCount: number,
    event: string,
    eventId: string
  ): Promise<void> {
    const deadLetterQueue = this.getDeadLetterQueue(options.queue)

    await channel.publish(
      RABBIT_DEAD_LETTER_EXCHANGE,
      deadLetterQueue,
      rawMessage.content,
      this.getPublishOptions(rawMessage, retryCount)
    )

    this.logger.error(
      `RabbitMQ message moved to DLQ queue=${options.queue} event=${event} eventId=${eventId} retryCount=${retryCount}`
    )
  }

  private getPublishOptions(
    rawMessage: ConsumeMessage,
    retryCount: number
  ): Record<string, unknown> {
    return {
      ...rawMessage.properties,
      persistent: true,
      headers: {
        ...(rawMessage.properties.headers ?? {}),
        [RETRY_COUNT_HEADER]: retryCount
      }
    }
  }

  private parseMessage(rawMessage: ConsumeMessage): RabbitMessage {
    const parsed: unknown = JSON.parse(rawMessage.content.toString('utf-8'))

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('eventId' in parsed) ||
      typeof parsed.eventId !== 'string' ||
      !('event' in parsed) ||
      typeof parsed.event !== 'string' ||
      !('occurredAt' in parsed) ||
      typeof parsed.occurredAt !== 'string' ||
      !('data' in parsed)
    ) {
      throw new Error('Invalid RabbitMQ message envelope')
    }

    return parsed as RabbitMessage
  }

  private getRetryCount(rawMessage: ConsumeMessage): number {
    const retryCountHeader: unknown =
      rawMessage.properties.headers?.[RETRY_COUNT_HEADER]

    return parseNonNegativeInteger(
      typeof retryCountHeader === 'number' ||
        typeof retryCountHeader === 'string'
        ? String(retryCountHeader)
        : undefined,
      0
    )
  }

  private getRetryDelay(retryCount: number): number {
    return this.retryDelays[
      Math.min(retryCount - 1, this.retryDelays.length - 1)
    ]
  }

  private getRetryQueue(
    queue: string,
    routingKey: string,
    retryCount: number
  ): string {
    return `${this.getQueueBase(queue)}.retry.${routingKey}.${retryCount}`
  }

  private getDeadLetterQueue(queue: string): string {
    return `${this.getQueueBase(queue)}.dlq`
  }

  private getQueueBase(queue: string): string {
    return queue.endsWith('.queue') ? queue.slice(0, -'.queue'.length) : queue
  }
}

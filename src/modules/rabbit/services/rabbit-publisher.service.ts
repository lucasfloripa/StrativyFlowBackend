import { randomUUID } from 'crypto'

import { Injectable } from '@nestjs/common'

import {
  DEFAULT_RABBIT_PUBLISH_CONCURRENCY,
  RABBIT_EXCHANGE
} from '../constants/rabbit.constants'
import { RabbitMessage } from '../interfaces/rabbit-message.interface'

import { RabbitConnectionService } from './rabbit-connection.service'

interface PublishManyItem {
  routingKey: string
  payload: unknown
  eventId?: string
  occurredAt?: string
}

interface PublishManyOptions {
  concurrency?: number
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

@Injectable()
export class RabbitPublisherService {
  private readonly defaultConcurrency = parsePositiveInteger(
    process.env.RABBIT_PUBLISH_CONCURRENCY,
    DEFAULT_RABBIT_PUBLISH_CONCURRENCY
  )

  constructor(
    private readonly rabbitConnectionService: RabbitConnectionService
  ) {}

  async publish(
    routingKey: string,
    payload: unknown,
    overrides: { eventId?: string; occurredAt?: string } = {}
  ): Promise<void> {
    const message: RabbitMessage = {
      eventId: overrides.eventId ?? randomUUID(),
      event: routingKey,
      occurredAt: overrides.occurredAt ?? new Date().toISOString(),
      data: payload
    }

    const content = Buffer.from(JSON.stringify(message))
    const channel = this.rabbitConnectionService.getChannel()
    await channel.publish(RABBIT_EXCHANGE, routingKey, content, {
      persistent: true,
      timestamp: Date.now(),
      contentType: 'application/json'
    })
  }

  /**
   * Publishes with bounded concurrency. The batch is not transactional: all
   * workers settle, confirmed messages stay published, and failures are reported.
   */
  async publishMany(
    messages: PublishManyItem[],
    options: PublishManyOptions = {}
  ): Promise<void> {
    if (messages.length === 0) {
      return
    }

    const concurrency = parsePositiveInteger(
      options.concurrency?.toString(),
      this.defaultConcurrency
    )
    let index = 0
    const failures: Error[] = []
    let publishedCount = 0

    const workers = Array.from(
      { length: Math.min(concurrency, messages.length) },
      async () => {
        while (index < messages.length) {
          const currentIndex = index
          index += 1

          const message = messages[currentIndex]
          try {
            await this.publish(message.routingKey, message.payload, {
              eventId: message.eventId,
              occurredAt: message.occurredAt
            })
            publishedCount += 1
          } catch (error) {
            failures.push(
              new Error(
                `RabbitMQ publish failed at index=${currentIndex} routingKey=${message.routingKey}`,
                { cause: error }
              )
            )
          }
        }
      }
    )

    await Promise.all(workers)

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} of ${messages.length} RabbitMQ messages failed; ${publishedCount} confirmed`
      )
    }
  }
}

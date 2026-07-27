import { randomUUID } from 'crypto'

import { Injectable } from '@nestjs/common'

import { RABBIT_EXCHANGE } from '../constants/rabbit.constants'
import { RabbitMessage } from '../interfaces/rabbit-message.interface'

import { RabbitConnectionService } from './rabbit-connection.service'

@Injectable()
export class RabbitPublisherService {
  constructor(
    private readonly rabbitConnectionService: RabbitConnectionService
  ) {}

  async publish(routingKey: string, payload: unknown): Promise<void> {
    const message: RabbitMessage = {
      eventId: randomUUID(),
      event: routingKey,
      occurredAt: new Date().toISOString(),
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
}

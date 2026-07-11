import { Injectable, Logger } from '@nestjs/common'
import { ConsumeMessage } from 'amqplib'

import { RABBIT_EXCHANGE } from '../constants/rabbit.constants'
import { RabbitMessage } from '../interfaces/rabbit-message.interface'
import { RabbitSubscription } from '../interfaces/rabbit-subscription.interface'
import { RabbitConnectionService } from './rabbit-connection.service'

@Injectable()
export class RabbitConsumerService {
  private readonly logger = new Logger(RabbitConsumerService.name)

  constructor(private readonly rabbitConnectionService: RabbitConnectionService) {}

  async subscribe(options: RabbitSubscription): Promise<void> {
    const channel = this.rabbitConnectionService.getChannel()

    await channel.addSetup(async (confirmChannel) => {
      await confirmChannel.assertExchange(RABBIT_EXCHANGE, 'topic', {
        durable: true
      })

      await confirmChannel.assertQueue(options.queue, {
        durable: true
      })

      await confirmChannel.bindQueue(options.queue, RABBIT_EXCHANGE, options.routingKey)

      await confirmChannel.consume(
        options.queue,
        async (rawMessage) => {
          await this.handleMessage(confirmChannel, rawMessage, options)
        },
        {
          noAck: false
        }
      )
    })
  }

  private async handleMessage(
    confirmChannel: {
      ack: (message: ConsumeMessage) => void
      nack: (message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean) => void
    },
    rawMessage: ConsumeMessage | null,
    options: RabbitSubscription
  ): Promise<void> {
    if (!rawMessage) {
      return
    }

    try {
      const parsed = JSON.parse(rawMessage.content.toString('utf-8')) as RabbitMessage
      await options.handler(parsed)
      confirmChannel.ack(rawMessage)
    } catch (error) {
      this.logger.error(`Error consuming message from queue ${options.queue}`, error as Error)
      confirmChannel.nack(rawMessage, false, false)
    }
  }
}

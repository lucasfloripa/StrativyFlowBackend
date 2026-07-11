import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import {
  AmqpConnectionManager,
  ChannelWrapper,
  connect
} from 'amqp-connection-manager'
import { ConfirmChannel } from 'amqplib'

import { RABBIT_EXCHANGE } from '../constants/rabbit.constants'

@Injectable()
export class RabbitConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitConnectionService.name)

  private connection: AmqpConnectionManager | null = null

  private channel: ChannelWrapper | null = null

  async onModuleInit(): Promise<void> {
    const rabbitMqEnabled = process.env.RABBITMQ_ENABLED === 'true'

    if (!rabbitMqEnabled) {
      this.logger.log('RabbitMQ disabled by env (RABBITMQ_ENABLED=false).')
      return
    }

    const rabbitMqUrl = process.env.RABBITMQ_URL

    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL env var must be configured when RABBITMQ_ENABLED=true')
    }

    this.connection = connect([rabbitMqUrl], {
      heartbeatIntervalInSeconds: 5,
      reconnectTimeInSeconds: 5
    })

    this.connection.on('connect', () => {
      this.logger.log('RabbitMQ connected.')
    })

    this.connection.on('disconnect', (params) => {
      this.logger.error(`RabbitMQ disconnected: ${params.err?.message ?? 'unknown error'}`)
    })

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(RABBIT_EXCHANGE, 'topic', {
          durable: true
        })
      }
    })

    await this.channel.waitForConnect()
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel) {
      await this.channel.close()
      this.channel = null
    }

    if (this.connection) {
      await this.connection.close()
      this.connection = null
    }
  }

  getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      throw new Error('RabbitMQ connection is not initialized')
    }

    return this.connection
  }

  getChannel(): ChannelWrapper {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized')
    }

    return this.channel
  }
}

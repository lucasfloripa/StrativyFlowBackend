import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'
import { RabbitConsumerService } from '../../rabbit/services/rabbit-consumer.service'
import { LeadCreatedHandler } from '../handlers/lead-created.handler'
import { MessageReceivedHandler } from '../handlers/message-received.handler'
import { NotificationEventHandler } from '../handlers/notification-event-handler.interface'

@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name)

  private readonly handlersByEvent: Map<string, NotificationEventHandler>

  constructor(
    private readonly rabbitConsumer: RabbitConsumerService,
    leadCreatedHandler: LeadCreatedHandler,
    messageReceivedHandler: MessageReceivedHandler
  ) {
    this.handlersByEvent = new Map<string, NotificationEventHandler>([
      [leadCreatedHandler.event, leadCreatedHandler],
      [messageReceivedHandler.event, messageReceivedHandler]
    ])
  }

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumer.subscribe({
      queue: 'notifications.queue',
      routingKey: 'lead.created',
      handler: this.handleMessage.bind(this)
    })

    await this.rabbitConsumer.subscribe({
      queue: 'notifications.queue',
      routingKey: 'message.received',
      handler: this.handleMessage.bind(this)
    })

    this.logger.log('Notification consumer initialized')
  }

  private async handleMessage(message: RabbitMessage): Promise<void> {
    this.logger.log(`Notification consumer received event=${message.event}`)

    const handler = this.handlersByEvent.get(message.event)

    if (!handler) {
      this.logger.warn(`No handler found for event ${message.event}`)
      return
    }

    await handler.handle(message)

    this.logger.log(`Notification consumer processed event=${message.event}`)
  }
}

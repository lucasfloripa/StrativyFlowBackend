import { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'

export interface NotificationEventHandler {
  readonly event: 'lead.created' | 'message.received'
  handle(message: RabbitMessage): Promise<void>
}

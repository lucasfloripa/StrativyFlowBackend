import { RabbitMessage } from './rabbit-message.interface'

export interface RabbitSubscription {
  queue: string
  routingKey: string
  handler: (message: RabbitMessage) => Promise<void>
}

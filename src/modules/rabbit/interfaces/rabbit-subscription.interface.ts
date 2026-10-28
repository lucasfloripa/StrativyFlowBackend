import { RabbitMessage } from './rabbit-message.interface'

export interface RabbitSubscription {
  queue: string
  routingKey: string
  handler: (message: RabbitMessage) => Promise<void>
  /**
   * Fan-out subscription owned by this process (e.g. realtime events every
   * API instance must see): the queue is exclusive and auto-deleted, and a
   * failed message is logged and dropped, without retry queues or DLQ.
   */
  exclusive?: boolean
}

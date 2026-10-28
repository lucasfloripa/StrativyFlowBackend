import { randomUUID } from 'crypto'
import { hostname } from 'os'

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { RabbitConsumerService } from '../../rabbit/services/rabbit-consumer.service'
import { RealtimeService } from '../realtime.service'

import {
  parseRealtimeEmitCommand,
  REALTIME_EMIT_ROUTING_KEY
} from './realtime-bridge.message'

import type { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'

/**
 * API side of the realtime bridge. Every API instance consumes
 * `realtime.emit` through its own exclusive queue, so an event published by
 * the worker reaches the sockets connected to any instance.
 */
@Injectable()
export class RealtimeBridgeConsumer implements OnModuleInit {
  private readonly logger = new Logger(RealtimeBridgeConsumer.name)
  readonly queue = `${REALTIME_EMIT_ROUTING_KEY}.${hostname()}.${randomUUID().slice(0, 8)}`

  constructor(
    private readonly rabbitConsumerService: RabbitConsumerService,
    private readonly realtimeService: RealtimeService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumerService.subscribe({
      queue: this.queue,
      routingKey: REALTIME_EMIT_ROUTING_KEY,
      exclusive: true,
      handler: (message) => this.handle(message)
    })
  }

  handle(message: RabbitMessage): Promise<void> {
    const command = parseRealtimeEmitCommand(message.data)

    if (!command) {
      this.logger.warn(
        `Ignoring malformed realtime.emit message. eventId=${message.eventId}`
      )
      return Promise.resolve()
    }

    switch (command.target) {
      case 'lead':
        this.realtimeService.emitToLead(
          command.leadId,
          command.event,
          command.payload
        )
        break
      case 'user':
        this.realtimeService.emitToUser(
          command.userId,
          command.event,
          command.payload
        )
        break
      case 'broadcast':
        this.realtimeService.emitBroadcast(command.event, command.payload)
        break
    }

    return Promise.resolve()
  }
}

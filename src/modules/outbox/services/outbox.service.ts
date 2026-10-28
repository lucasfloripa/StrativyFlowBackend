import { randomUUID } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import {
  OutboxMessage,
  OutboxMessageStatus
} from '../entities/outbox-message.entity'

import { OutboxRelayService } from './outbox-relay.service'

import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

export type OutboxItem = {
  routingKey: string
  payload: Record<string, unknown>
}

/**
 * Entry point for events that must reach RabbitMQ. A message is first written
 * to `outbox_messages` (pass the `EntityManager` of the surrounding
 * transaction to make it atomic with the state change), then published.
 * If publishing fails it stays pending and the worker relay retries it.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name)

  constructor(
    @InjectRepository(OutboxMessage)
    private readonly outboxRepo: Repository<OutboxMessage>,
    private readonly outboxRelayService: OutboxRelayService
  ) {}

  /** Writes the messages to the outbox and returns their IDs (= event IDs). */
  async enqueue(
    items: OutboxItem[],
    manager?: EntityManager
  ): Promise<string[]> {
    if (items.length === 0) {
      return []
    }

    const rows = items.map((item) => ({
      id: randomUUID(),
      routingKey: item.routingKey,
      payload: item.payload,
      status: OutboxMessageStatus.PENDING
    }))
    const repository = manager
      ? manager.getRepository(OutboxMessage)
      : this.outboxRepo

    // `QueryDeepPartialEntity` cannot express a free-form jsonb payload.
    await repository.insert(rows as QueryDeepPartialEntity<OutboxMessage>[])

    return rows.map((row) => row.id)
  }

  /**
   * Best-effort immediate publish of rows already committed. Never throws:
   * whatever is not published now is left to the worker relay.
   */
  async dispatch(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return
    }

    try {
      await this.outboxRelayService.relayPending({ ids })
    } catch (error) {
      this.logger.warn(
        `Immediate outbox dispatch failed, the relay will retry. count=${ids.length} error=${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Enqueue outside a transaction and dispatch right away. Throws only if the
   * outbox row cannot be written.
   */
  async publish(
    routingKey: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const ids = await this.enqueue([{ routingKey, payload }])
    await this.dispatch(ids)
  }
}

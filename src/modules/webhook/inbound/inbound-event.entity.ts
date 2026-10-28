import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn
} from 'typeorm'

import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import { InboundEventKind } from './inbound-event.types'

export enum InboundEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  IGNORED = 'ignored',
  FAILED = 'failed'
}

/**
 * Transactional inbox: one row per event Meta delivered, written before the
 * event is processed. `(channel, dedupeKey)` is the idempotency key.
 */
@Entity('inbound_events')
@Index('UQ_inbound_events_channel_dedupe_key', ['channel', 'dedupeKey'], {
  unique: true
})
@Index('IDX_inbound_events_status_received_at', ['status', 'receivedAt'])
export class InboundEventRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({
    type: 'enum',
    enum: LeadChannel,
    enumName: 'inbound_event_channel_enum'
  })
  channel!: LeadChannel

  @Column({
    type: 'enum',
    enum: InboundEventKind,
    enumName: 'inbound_event_kind_enum'
  })
  kind!: InboundEventKind

  @Column({ type: 'varchar' })
  dedupeKey!: string

  @Column({ type: 'varchar', nullable: true })
  externalAccountId!: string | null

  @Column({ type: 'varchar', nullable: true })
  externalUserId!: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationKey!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  occurredAt!: Date | null

  @Column({ type: 'jsonb' })
  payload!: unknown

  @Column({
    type: 'enum',
    enum: InboundEventStatus,
    enumName: 'inbound_event_status_enum',
    default: InboundEventStatus.PENDING
  })
  status!: InboundEventStatus

  @Column({ type: 'int', default: 0 })
  attempts!: number

  @Column({ type: 'text', nullable: true })
  lastError!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null
}

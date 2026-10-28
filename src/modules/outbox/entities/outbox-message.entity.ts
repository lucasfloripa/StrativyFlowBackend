import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

export enum OutboxMessageStatus {
  PENDING = 'pending',
  PUBLISHED = 'published'
}

/**
 * Transactional outbox: a RabbitMQ message written to Postgres together with
 * the state change that caused it, and published afterwards by the relay.
 * `id` becomes the `eventId` of the `RabbitMessage`, so consumers can dedupe.
 */
@Entity('outbox_messages')
@Index('IDX_outbox_messages_pending_available_at', ['availableAt'], {
  where: `"status" = 'pending'`
})
export class OutboxMessage {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  routingKey!: string

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>

  @Column({
    type: 'enum',
    enum: OutboxMessageStatus,
    enumName: 'outbox_message_status_enum',
    default: OutboxMessageStatus.PENDING
  })
  status!: OutboxMessageStatus

  @Column({ type: 'int', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date

  @Column({ type: 'text', nullable: true })
  lastError!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null
}

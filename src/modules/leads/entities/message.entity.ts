import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm'

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  REACTION = 'reaction'
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  RECEIVED = 'received'
}

@Entity('messages')
@Index('idx_messages_lead_id', ['leadId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  leadId!: string

  @Column({
    type: 'enum',
    enum: MessageDirection
  })
  direction!: MessageDirection

  @Column({ type: 'text', nullable: true })
  content?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  externalTimestamp?: Date | null

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT
  })
  type!: MessageType

  @Column({ type: 'varchar', nullable: true, unique: true })
  whatsappMessageId?: string | null

  @Column({ type: 'varchar', nullable: true })
  metaMediaId?: string | null

  @Column({ type: 'varchar', nullable: true })
  mediaUrl?: string | null

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string | null

  @Column({ type: 'bigint', nullable: true })
  mediaSize?: number | null

  @Column({ type: 'varchar', nullable: true })
  mediaSha256?: string | null

  @Column({ type: 'varchar', nullable: true })
  fileName?: string | null

  @Column({
    type: 'enum',
    enum: MessageStatus,
    nullable: true
  })
  status?: MessageStatus | null

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

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
  OUTBOUND = 'OUTBOUND',
  AUTOMATIC = 'AUTOMATIC'
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
  REACTION = 'reaction',
  BUTTON = 'button'
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  RECEIVED = 'received'
}

export enum MessageSource {
  NORMAL = 'normal',
  TEMPLATE = 'template'
}

export enum MessageChannel {
  WHATSAPP = 'whatsapp',
  MESSENGER = 'messenger',
  INSTAGRAM = 'instagram'
}

@Entity('messages')
@Index('idx_messages_lead_id', ['leadId'])
@Index(
  'UQ_messages_channel_externalMessageId',
  ['channel', 'externalMessageId'],
  {
    unique: true
  }
)
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

  @Column({
    type: 'enum',
    enum: MessageChannel,
    enumName: 'message_channel_enum',
    default: MessageChannel.WHATSAPP
  })
  channel!: MessageChannel

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

  @Column({ type: 'varchar', nullable: true })
  externalMessageId?: string | null

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

  @Column({
    type: 'enum',
    enum: MessageSource,
    default: MessageSource.NORMAL
  })
  source!: MessageSource

  @Column({ type: 'varchar', nullable: true })
  templateType?: string | null

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

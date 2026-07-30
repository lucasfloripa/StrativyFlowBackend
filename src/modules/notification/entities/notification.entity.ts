import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

export enum NotificationType {
  LEAD_CREATED = 'LEAD_CREATED',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  FOLLOW_UP_REMINDER_1H = 'FOLLOW_UP_REMINDER_1H',
  CONVERSATION_EXPIRING_1H = 'CONVERSATION_EXPIRING_1H',
  CONVERSATION_EXPIRED = 'CONVERSATION_EXPIRED'
}

export enum NotificationReferenceType {
  LEAD = 'LEAD',
  MESSAGE = 'MESSAGE',
  FOLLOW_UP = 'FOLLOW_UP'
}

@Entity('notifications')
@Index('idx_notifications_user_id_created_at', ['userId', 'createdAt'])
@Index('idx_notifications_user_id_is_read', ['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  @Column({ type: 'varchar' })
  userId!: string

  @Column({
    type: 'enum',
    enum: NotificationType
  })
  type!: NotificationType

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text' })
  description!: string

  @Column({
    type: 'enum',
    enum: NotificationReferenceType
  })
  referenceType!: NotificationReferenceType

  @Column({ type: 'varchar' })
  referenceId!: string

  @Column({ type: 'boolean', default: false })
  isRead!: boolean

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

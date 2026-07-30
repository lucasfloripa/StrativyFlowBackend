import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import type { NotificationPreferences } from '../../notification/types'

@Entity('user_informations')
@Index(['phoneNumber'], { unique: true })
export class UserInformations {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  userId!: string

  @Column({ type: 'varchar', nullable: true })
  name?: string | null

  @Column({ type: 'varchar', nullable: true })
  email?: string | null

  @Column()
  phoneNumber!: string

  @Column({ type: 'varchar', nullable: true })
  phoneNumberId?: string | null

  @Column({ type: 'varchar', nullable: true })
  whatsappToken?: string | null

  @Column({ type: 'json', nullable: true })
  messageShortcuts?: Record<string, string> | null

  @Column('text', { array: true, default: '{}' })
  notificationWhatsAppNumbers!: string[]

  @Column('text', { array: true, default: '{}' })
  notificationEmails!: string[]

  @Column({
    type: 'jsonb',
    default: {}
  })
  notificationPreferences!: NotificationPreferences

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

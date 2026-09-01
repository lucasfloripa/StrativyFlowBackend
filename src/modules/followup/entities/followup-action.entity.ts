import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { MessageChannel } from '../../leads/entities/message.entity'

import { FollowUp } from './followup.entity'

export enum FollowUpActionType {
  SEND_MESSAGE = 'send_message',
  SEND_EMAIL = 'send_email'
}

export enum FollowUpActionChannel {
  WHATSAPP = MessageChannel.WHATSAPP,
  MESSENGER = MessageChannel.MESSENGER,
  INSTAGRAM = MessageChannel.INSTAGRAM,
  AGENDA = 'Agenda'
}

export enum FollowUpActionStatus {
  SCHEDULED = 'scheduled',
  AWAITING_REPLY = 'awaiting_reply',
  EXECUTED = 'executed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  MANUAL_REQUIRED = 'manual_required'
}

@Entity('followup_actions')
export class FollowUpAction {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  followUpId!: string

  @ManyToOne(() => FollowUp, (followUp) => followUp.actions, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'followUpId' })
  followUp!: FollowUp

  @Column({ type: 'varchar' })
  type!: FollowUpActionType

  @Column({ type: 'varchar', nullable: true })
  channel?: FollowUpActionChannel | null

  @Column({
    type: 'varchar',
    default: FollowUpActionStatus.SCHEDULED
  })
  status!: FollowUpActionStatus

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null

  @Column({ type: 'timestamptz', nullable: true })
  executedAt?: Date | null

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null

  @Column({ type: 'uuid', nullable: true })
  replyMessageId?: string | null

  @Column({ type: 'text', nullable: true })
  replyContent?: string | null

  @Column({ type: 'varchar', nullable: true })
  replyType?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { MessageChannel } from '../../leads/entities/message.entity'

import { FollowUp } from './followup.entity'

export enum FollowUpStepType {
  ACTION = 'action',
  CONDITION = 'condition',
  // Temporary aliases used only by the legacy executor until its migration.
  SEND_MESSAGE = 'send_message',
  SEND_EMAIL = 'send_email'
}

export enum FollowUpActionType {
  SEND_MESSAGE = 'send_message',
  SEND_EMAIL = 'send_email',
  CREATE_FOLLOW_UP = 'create_follow_up',
  QUALIFY_LEAD = 'qualify_lead',
  CHANGE_STAGE = 'change_stage',
  CHANGE_STATUS = 'change_status',
  CHANGE_TEMPERATURE = 'change_temperature',
  ARCHIVE_LEAD = 'archive_lead',
  DELETE_LEAD = 'delete_lead',
  DELETE_NEGOTIATION = 'delete_negotiation'
}

export enum FollowUpConditionType {
  RESPONSE_RECEIVED = 'response_received',
  NO_RESPONSE = 'no_response',
  DEADLINE_REACHED = 'deadline_reached'
}

export enum FollowUpStepChannel {
  WHATSAPP = MessageChannel.WHATSAPP,
  MESSENGER = MessageChannel.MESSENGER,
  INSTAGRAM = MessageChannel.INSTAGRAM,
  AGENDA = 'Agenda'
}

export enum FollowUpStepStatus {
  PENDING = 'pending',
  WAITING = 'waiting',
  EXECUTING = 'executing',
  // Temporary alias used only by the legacy executor until its migration.
  SCHEDULED = 'scheduled',
  AWAITING_REPLY = 'awaiting_reply',
  EXECUTED = 'executed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  MANUAL_REQUIRED = 'manual_required'
}

export enum FollowUpWaitUnit {
  MINUTES = 'minutes',
  HOURS = 'hours',
  DAYS = 'days'
}

@Entity('followup_steps')
export class FollowUpStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  followUpId!: string

  @ManyToOne(() => FollowUp, (followUp) => followUp.steps, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'followUpId' })
  followUp!: FollowUp

  @Column({ type: 'uuid', nullable: true })
  parentId?: string | null

  @ManyToOne(() => FollowUpStep, (step) => step.children, {
    nullable: true,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'parentId' })
  parent?: FollowUpStep | null

  @OneToMany(() => FollowUpStep, (step) => step.parent)
  children!: FollowUpStep[]

  @Column({ type: 'varchar' })
  type!: FollowUpStepType

  @Column({ type: 'varchar', nullable: true })
  actionType?: FollowUpActionType | null

  @Column({ type: 'varchar', nullable: true })
  conditionType?: FollowUpConditionType | null

  @Column({ type: 'varchar', nullable: true })
  channel?: FollowUpStepChannel | null

  @Column({
    type: 'varchar',
    default: FollowUpStepStatus.PENDING
  })
  status!: FollowUpStepStatus

  @Column({ type: 'integer', nullable: true })
  waitTime?: number | null

  @Column({ type: 'varchar', nullable: true })
  waitUnit?: FollowUpWaitUnit | null

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date | null

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null

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

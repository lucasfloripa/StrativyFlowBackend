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

import { Negotiation } from '../../negotiation/entities/negotiation.entity'

import { FollowUpAction } from './followup-action.entity'

export enum FollowUpStatus {
  PENDING = 'pending',
  DONE = 'done',
  CANCELED = 'canceled',
  SKIPPED = 'skipped'
}

@Entity('followups')
export class FollowUp {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  negotiationId!: string

  @ManyToOne(() => Negotiation, (negotiation) => negotiation.followUps, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'negotiationId' })
  negotiation!: Negotiation

  @Column({ name: 'value', type: 'text' })
  title!: string

  @Column({ type: 'timestamptz' })
  dueAt!: Date

  @Column({
    type: 'varchar',
    default: FollowUpStatus.PENDING
  })
  status!: FollowUpStatus

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null

  @Column({ name: 'remider1hSentAt', type: 'timestamptz', nullable: true })
  reminder1hSentAt?: Date | null

  @OneToMany(() => FollowUpAction, (action) => action.followUp, {
    cascade: true
  })
  actions!: FollowUpAction[]

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date

  // Backward-compatibility bridge for untouched modules while domain migrates to title.
  get value(): string {
    return this.title
  }

  set value(value: string) {
    this.title = value
  }
}

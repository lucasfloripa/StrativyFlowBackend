import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Negotiation } from '../../negotiation/entities/negotiation.entity'

export enum FollowUpStatus {
  PENDING = 'pending',
  DONE = 'done',
  CANCELED = 'canceled'
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

  @Column({ type: 'text' })
  value!: string

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

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

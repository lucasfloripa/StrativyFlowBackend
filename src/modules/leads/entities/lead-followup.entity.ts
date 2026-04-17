import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm'

import { Lead } from './lead.entity'

export type LeadFollowUpStatus = 'pending' | 'done' | 'canceled'

@Entity('lead_followups')
@Index(['leadId'])
@Index(['leadId', 'status'])
@Index(['leadId', 'status', 'dueAt'])
export class LeadFollowUp {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  leadId: string

  @ManyToOne(() => Lead, (lead) => lead.followUps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead

  @Column({ type: 'text' })
  value: string

  @Column({ type: 'timestamptz' })
  dueAt: Date

  @Column({
    type: 'varchar',
    default: 'pending'
  })
  status: LeadFollowUpStatus

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany
} from 'typeorm'

import { LeadFollowUp } from './lead-followup.entity'

export enum LeadTemperature {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold'
}

export enum LeadOutcome {
  WON = 'won',
  LOST = 'lost'
}

export enum LeadState {
  ACTIVE = 'active',
  ARCHIVED = 'archived'
}

@Entity('leads')
@Index(['boardId', 'phone'])
@Index(['boardId', 'columnId', 'position'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  boardId: string

  @Column()
  columnId: string

  @Column({ type: 'int', default: 0 })
  position: number

  @Column()
  name: string

  @Column()
  phone: string

  @Column({ nullable: true })
  email?: string

  @Column({ nullable: true })
  source?: string

  @Column({ nullable: true })
  companyName?: string

  @Column({ type: 'text', nullable: true })
  notes?: string

  @Column({ type: 'text', nullable: true })
  initialContext?: string

  @OneToMany(() => LeadFollowUp, (followup) => followup.lead)
  followUps: LeadFollowUp[]

  @Column({ nullable: true })
  lastInboundMessageId?: string

  @Column({ nullable: true })
  lastAutoReplyMessageId?: string

  @Column({ type: 'timestamptz', nullable: true })
  movedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt?: Date

  @Column({
    type: 'varchar',
    nullable: true
  })
  temperature?: LeadTemperature | null

  @Column({
    type: 'varchar',
    nullable: true
  })
  outcome?: LeadOutcome | null

  @Column({
    type: 'varchar',
    default: LeadState.ACTIVE
  })
  state: LeadState

  @Column({ default: false })
  isFavorite: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

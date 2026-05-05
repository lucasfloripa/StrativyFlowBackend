import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany
} from 'typeorm'

import { Lead, LeadTemperature } from '../../leads/entities/lead.entity'

import { Board } from './board.entity'

export interface BoardColumnOnEnterCreateFollowUpAutomation {
  value: string
  dueAt?: string
}

export interface BoardColumnOnEnterAutomation {
  createFollowUp?: BoardColumnOnEnterCreateFollowUpAutomation
  favoriteLead?: boolean
  markAllFollowUpsAsDone?: boolean
  resetLastActivityAt?: boolean
  setTemperature?: LeadTemperature
}

@Entity('board_columns')
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column()
  boardId: string

  @Column({ type: 'int' })
  position: number

  @Column({ default: false })
  isDefault: boolean

  @Column({ type: 'jsonb', nullable: true })
  onEnter?: BoardColumnOnEnterAutomation | null

  @ManyToOne(() => Board, (b) => b.columns, { onDelete: 'CASCADE' })
  board: Board

  @OneToMany(() => Lead, (lead) => lead /* relation no Lead */, {
    cascade: false
  })
  leads: Lead[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

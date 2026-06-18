import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm'

import { AutomationAction } from '../flow/automation-action.types'
import { AutomationTriggerType } from '../flow/automation-trigger.types'

export type AutomationRuleConditions = {
  messageContains?: string
  runtimeMode?: 'HUMAN' | 'AUTOMATION'
}

@Entity('automation_rules')
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  boardId!: string

  @Column()
  name!: string

  @Column({ default: true })
  isActive!: boolean

  @Column({
    type: 'enum',
    enum: AutomationTriggerType
  })
  triggerType!: AutomationTriggerType

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb"
  })
  actions!: AutomationAction[]

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb"
  })
  conditions!: AutomationRuleConditions

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

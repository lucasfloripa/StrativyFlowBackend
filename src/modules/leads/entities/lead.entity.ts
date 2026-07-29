import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany
} from 'typeorm'

import { Negotiation } from '../../negotiation/entities/negotiation.entity'

export enum LeadState {
  ACTIVE = 'active',
  ARCHIVED = 'archived'
}

export enum LeadFlowState {
  NEW = 'NEW',
  ASKING_NAME = 'ASKING_NAME',
  ASKING_LOCATION = 'ASKING_LOCATION',
  ASKING_CONTEXT = 'ASKING_CONTEXT',
  IN_CONVERSATION = 'IN_CONVERSATION'
}

export enum LeadRuntimeMode {
  HUMAN = 'HUMAN',
  AUTOMATION = 'AUTOMATION'
}

export enum LeadQualification {
  QUALIFY = 'qualify',
  NOT_QUALIFY = 'not qualify'
}

export enum LeadSocialLinks {
  INSTAGRAM = 'instagram',
  URL = 'url'
}

@Entity('leads')
@Index(['userInformationsId', 'phone'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ nullable: true })
  userInformationsId?: string

  @Column()
  name!: string

  @Column()
  phone!: string

  @Column({ nullable: true })
  email?: string

  @Column({ nullable: true })
  location?: string

  @Column({ nullable: true })
  source?: string

  @Column({ nullable: true })
  metaAdId?: string

  @Column({ nullable: true })
  googleAdId?: string

  @Column({
    type: 'jsonb',
    nullable: true
  })
  socialLinks?: Partial<Record<LeadSocialLinks, string>> | null

  @Column({
    type: 'enum',
    enum: LeadQualification,
    nullable: true
  })
  leadQualification?: LeadQualification | null

  @OneToMany(() => Negotiation, (negotiation) => negotiation.lead)
  negotiations!: Negotiation[]

  @Column({ nullable: true })
  lastInboundMessageId?: string

  @Column({ nullable: true })
  lastAutoReplyMessageId?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt?: Date

  @Column({
    type: 'varchar',
    default: LeadState.ACTIVE
  })
  state!: LeadState

  @Column({
    type: 'enum',
    enum: LeadFlowState,
    default: LeadFlowState.NEW
  })
  flowState!: LeadFlowState

  @Column({
    type: 'enum',
    enum: LeadRuntimeMode,
    default: LeadRuntimeMode.AUTOMATION
  })
  runtimeMode!: LeadRuntimeMode

  @Column({ default: false })
  isFavorite!: boolean

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

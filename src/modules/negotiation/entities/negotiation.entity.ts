import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { FollowUp } from '../../followup/entities/followup.entity'
import { Lead } from '../../leads/entities/lead.entity'

import { NegotiationAttachment } from './negotiation-attachment.entity'

export enum NegotiationStage {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  LOST = 'LOST'
}

export enum NegotiationTemperature {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold'
}

export enum NegotiationType {
  SERVICE = 'service',
  PRODUCT = 'product'
}

export type NegotiationNote = {
  title: string
  description: string
  createdAt?: string
}

const isClosedNegotiationStage = (stage?: NegotiationStage): boolean => {
  return stage === NegotiationStage.WON || stage === NegotiationStage.LOST
}

@Entity('negotiations')
export class Negotiation {
  private loadedStage?: NegotiationStage

  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  leadId!: string

  @ManyToOne(() => Lead, (lead) => lead.negotiations, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'leadId' })
  lead!: Lead

  @OneToMany(() => FollowUp, (followUp) => followUp.negotiation)
  followUps!: FollowUp[]

  @OneToMany(
    () => NegotiationAttachment,
    (attachment) => attachment.negotiation
  )
  attachments!: NegotiationAttachment[]

  @Column({
    type: 'text',
    nullable: true
  })
  title?: string | null

  @Column({
    type: 'enum',
    enum: NegotiationStage,
    default: NegotiationStage.NEW
  })
  stage!: NegotiationStage

  @Column({
    type: 'enum',
    enum: NegotiationTemperature,
    nullable: true
  })
  temperature?: NegotiationTemperature | null

  @Column({
    type: 'enum',
    enum: NegotiationType,
    nullable: true
  })
  negotiationType?: NegotiationType | null

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true
  })
  value?: string | null

  @Column({ type: 'jsonb', nullable: true })
  notes?: NegotiationNote[] | null

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  stageUpdatedAt?: Date | null

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date

  @AfterLoad()
  cacheLoadedStage() {
    this.loadedStage = this.stage
  }

  @BeforeInsert()
  setStageDefaultsOnInsert() {
    if (!this.stage) {
      this.stage = NegotiationStage.NEW
    }

    if (!this.stageUpdatedAt) {
      this.stageUpdatedAt = new Date()
    }
  }

  @BeforeUpdate()
  touchStageUpdatedAtOnChange() {
    if (this.stage && this.loadedStage && this.stage !== this.loadedStage) {
      this.stageUpdatedAt = new Date()

      // Reopening a negotiation clears any previous close timestamp.
      if (
        isClosedNegotiationStage(this.loadedStage) &&
        !isClosedNegotiationStage(this.stage)
      ) {
        this.closedAt = null
      }
    }
  }
}

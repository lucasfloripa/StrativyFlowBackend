import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Lead } from './lead.entity'

export enum LeadChannel {
  WHATSAPP = 'whatsapp',
  MESSENGER = 'messenger',
  INSTAGRAM = 'instagram'
}

@Entity('lead_channel_identities')
@Index(
  'UQ_lead_channel_identity',
  ['channel', 'externalAccountId', 'externalUserId'],
  { unique: true }
)
export class LeadChannelIdentity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  leadId!: string

  @Column({
    type: 'enum',
    enum: LeadChannel,
    enumName: 'lead_channel_enum'
  })
  channel!: LeadChannel

  @Column()
  externalAccountId!: string

  @Column()
  externalUserId!: string

  @Column({ type: 'varchar', nullable: true })
  profileName?: string | null

  @Column({ type: 'varchar', nullable: true })
  profilePictureUrl?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  lastInteractionAt?: Date | null

  @ManyToOne(() => Lead, (lead) => lead.channelIdentities, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'leadId' })
  lead!: Lead

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

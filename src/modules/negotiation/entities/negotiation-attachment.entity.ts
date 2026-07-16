import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { Negotiation } from './negotiation.entity'

const bigintToNumberTransformer = {
  to: (value: number): string => String(value),
  from: (value: string): number => Number(value)
}

@Entity('negotiation_attachments')
export class NegotiationAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  negotiationId!: string

  @ManyToOne(() => Negotiation, (negotiation) => negotiation.attachments, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'negotiationId' })
  negotiation!: Negotiation

  @Column({ type: 'text' })
  key!: string

  @Column({ type: 'text' })
  originalName!: string

  @Column({ type: 'text' })
  mimeType!: string

  @Column({ type: 'text' })
  extension!: string

  @Column({
    type: 'bigint',
    transformer: bigintToNumberTransformer
  })
  size!: number

  @Column({ type: 'text' })
  uploadedByUserId!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}

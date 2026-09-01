import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { NegotiationAttachment } from './negotiation-attachment.entity'
import { NegotiationFinancial } from './negotiation-financial.entity'

export enum NegotiationPaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  OTHER = 'OTHER'
}

export enum NegotiationPaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELED = 'CANCELED'
}

@Entity('negotiation_payments')
export class NegotiationPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  negotiationFinancialId!: string

  @ManyToOne(() => NegotiationFinancial, (financial) => financial.payments, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'negotiationFinancialId' })
  negotiationFinancial!: NegotiationFinancial

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string

  @Column({ type: 'enum', enum: NegotiationPaymentMethod })
  paymentMethod!: NegotiationPaymentMethod

  @Column({ type: 'timestamptz' })
  dueDate!: Date

  @Column({ type: 'timestamptz', nullable: true })
  paidAt!: Date | null

  @Column({ type: 'enum', enum: NegotiationPaymentStatus })
  status!: NegotiationPaymentStatus

  @Column({ type: 'uuid', nullable: true })
  proofAttachmentId!: string | null

  @ManyToOne(() => NegotiationAttachment, {
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn({ name: 'proofAttachmentId' })
  proofAttachment!: NegotiationAttachment | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

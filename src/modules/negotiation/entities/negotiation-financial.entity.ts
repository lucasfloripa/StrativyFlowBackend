import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { NegotiationCost } from './negotiation-cost.entity'
import { NegotiationPayment } from './negotiation-payment.entity'
import { Negotiation } from './negotiation.entity'

@Entity('negotiation_financials')
export class NegotiationFinancial {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', unique: true })
  negotiationId!: string

  @OneToOne(() => Negotiation, (negotiation) => negotiation.financial, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'negotiationId' })
  negotiation!: Negotiation

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saleAmount!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  discountAmount!: string | null

  @OneToMany(() => NegotiationCost, (cost) => cost.negotiationFinancial)
  costs!: NegotiationCost[]

  @OneToMany(
    () => NegotiationPayment,
    (payment) => payment.negotiationFinancial
  )
  payments!: NegotiationPayment[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

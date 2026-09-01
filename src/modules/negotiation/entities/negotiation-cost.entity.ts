import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { NegotiationFinancial } from './negotiation-financial.entity'

export enum NegotiationCostType {
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
  COMMISSION = 'COMMISSION',
  TAX = 'TAX',
  FREIGHT = 'FREIGHT',
  FEE = 'FEE',
  OTHER = 'OTHER'
}

@Entity('negotiation_costs')
export class NegotiationCost {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  negotiationFinancialId!: string

  @ManyToOne(() => NegotiationFinancial, (financial) => financial.costs, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'negotiationFinancialId' })
  negotiationFinancial!: NegotiationFinancial

  @Column({ type: 'varchar' })
  description!: string

  @Column({ type: 'enum', enum: NegotiationCostType })
  type!: NegotiationCostType

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

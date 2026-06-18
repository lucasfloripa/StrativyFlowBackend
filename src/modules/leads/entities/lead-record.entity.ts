import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm'

@Entity('lead_records')
@Index(
  'idx_lead_records_phone_number_business_phone_unique',
  ['phoneNumber', 'businessPhoneNumber'],
  {
    unique: true
  }
)
export class LeadRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  phoneNumber: string

  @Column()
  businessPhoneNumber: string

  @Column()
  metaPhoneNumberId: string

  @Column({ type: 'timestamptz' })
  firstContactAt: Date

  @Column({ type: 'timestamptz' })
  lastContactAt: Date

  @Column({ type: 'int', default: 1 })
  contactCount: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

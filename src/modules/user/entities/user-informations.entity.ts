import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('user_informations')
@Index(['phoneNumber'], { unique: true })
export class UserInformations {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  userId!: string

  @Column({ type: 'varchar', nullable: true })
  name?: string | null

  @Column()
  phoneNumber!: string

  @Column({ type: 'varchar', nullable: true })
  phoneNumberId?: string | null

  @Column('text', { array: true, default: '{}' })
  notificationWhatsAppNumbers!: string[]

  @Column('text', { array: true, default: '{}' })
  notificationEmails!: string[]

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

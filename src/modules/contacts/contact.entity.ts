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

import { UserInformations } from '../user/entities/user-informations.entity'

@Entity('contacts')
@Index('UQ_contacts_user_informations_phone', ['userInformationsId', 'phone'], {
  unique: true
})
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  userInformationsId!: string

  @ManyToOne(() => UserInformations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userInformationsId' })
  userInformations!: UserInformations

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'varchar' })
  phone!: string

  @Column({ type: 'varchar', nullable: true })
  company!: string | null

  @Column({ type: 'varchar', nullable: true })
  instagram!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

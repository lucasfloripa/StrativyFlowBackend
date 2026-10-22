import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Lead } from '../leads/entities/lead.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'varchar', nullable: true })
  companyPhoneNumber?: string | null

  @Column({ type: 'varchar', nullable: true })
  companyPhoneNumberId?: string | null

  @Column({ type: 'varchar', nullable: true })
  whatsappToken?: string | null

  @Column({ name: 'messenger_page_id', type: 'varchar', nullable: true })
  messengerPageId?: string | null

  @Column({ name: 'messenger_token', type: 'varchar', nullable: true })
  messengerToken?: string | null

  @Column({ name: 'instagram_account_id', type: 'varchar', nullable: true })
  instagramAccountId?: string | null

  @Column({ name: 'instagram_token', type: 'varchar', nullable: true })
  instagramToken?: string | null

  @OneToMany(
    () => UserInformations,
    (userInformation) => userInformation.company
  )
  userInformations!: UserInformations[]

  @OneToMany(() => Lead, (lead) => lead.company)
  leads!: Lead[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}

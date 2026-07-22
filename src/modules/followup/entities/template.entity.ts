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

import { UserInformations } from '../../user/entities/user-informations.entity'

export type TemplateVariableDefinition = {
  key: string
  label: string
  required: boolean
}

@Entity('message_templates')
@Index(['userInformationsId', 'metaTemplateName'], { unique: true })
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', nullable: true })
  userInformationsId?: string | null

  @Column({ type: 'text' })
  metaTemplateName!: string

  @Column({ type: 'text', nullable: true })
  metaTemplateId?: string | null

  @Column({ type: 'text', default: 'pt_BR' })
  language!: string

  @Column({ type: 'text', nullable: true })
  category?: string | null

  @Column({ type: 'boolean', default: true })
  active!: boolean

  @ManyToOne(() => UserInformations, {
    onDelete: 'CASCADE',
    eager: true,
    nullable: true
  })
  @JoinColumn({ name: 'userInformationsId' })
  userInformations?: UserInformations | null

  @Column({ type: 'text' })
  name!: string

  @Column({ type: 'text', nullable: true })
  description?: string | null

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb"
  })
  variables!: TemplateVariableDefinition[]

  @CreateDateColumn({
    type: 'timestamptz'
  })
  createdAt!: Date

  @UpdateDateColumn({
    type: 'timestamptz'
  })
  updatedAt!: Date
}

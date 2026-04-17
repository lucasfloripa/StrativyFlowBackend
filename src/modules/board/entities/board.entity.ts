import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm'

import { BoardColumn } from './board-column.entity'

@Entity('boards')
export class Board {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column()
  boardPhone: string

  @Column()
  userId: string

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isArchived: boolean

  @OneToMany(() => BoardColumn, (col) => col.board)
  columns: BoardColumn[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

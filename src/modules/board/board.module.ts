import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LeadFollowUp } from '../leads/entities/lead-followup.entity'
import { Lead } from '../leads/entities/lead.entity'

import { BoardColumnsController } from './board-columns.controller'
import { BoardColumnsService } from './board-columns.service'
import { BoardController } from './board.controller'
import { BoardService } from './board.service'
import { BoardColumn } from './entities/board-column.entity'
import { Board } from './entities/board.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Board, BoardColumn, Lead, LeadFollowUp])],
  controllers: [BoardController, BoardColumnsController],
  providers: [BoardService, BoardColumnsService],
  exports: [BoardService, BoardColumnsService]
})
export class BoardModule {}

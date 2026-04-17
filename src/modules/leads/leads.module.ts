import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'

import { LeadFollowUp } from './entities/lead-followup.entity'
import { Lead } from './entities/lead.entity'
import { LeadFollowUpsController } from './lead-followups.controller'
import { LeadFollowUpsService } from './lead-followups.service'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Board, BoardColumn, LeadFollowUp])],
  controllers: [LeadsController, LeadFollowUpsController],
  providers: [LeadsService, LeadFollowUpsService],
  exports: [LeadsService, LeadFollowUpsService]
})
export class LeadsModule {}

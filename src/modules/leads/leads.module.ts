import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'

import { LeadFollowUp } from './entities/lead-followup.entity'
import { LeadRecord } from './entities/lead-record.entity'
import { Lead } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadFollowUpsController } from './lead-followups.controller'
import { LeadFollowUpsService } from './lead-followups.service'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadRecord,
      Board,
      BoardColumn,
      LeadFollowUp,
      Message
    ])
  ],
  controllers: [LeadsController, LeadFollowUpsController],
  providers: [LeadsService, LeadFollowUpsService],
  exports: [LeadsService, LeadFollowUpsService]
})
export class LeadsModule {}

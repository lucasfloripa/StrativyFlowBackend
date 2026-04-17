import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'
import { Lead } from '../leads/entities/lead.entity'
import { LeadsModule } from '../leads/leads.module'

import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
  imports: [LeadsModule, TypeOrmModule.forFeature([Lead, Board, BoardColumn])],
  providers: [WebhookService],
  controllers: [WebhookController]
})
export class WebhookModule {}

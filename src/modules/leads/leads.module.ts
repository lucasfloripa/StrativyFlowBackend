import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { RabbitModule } from '../rabbit/rabbit.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { Lead } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Message, UserInformations, FollowUp]),
    RabbitModule
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService]
})
export class LeadsModule {}

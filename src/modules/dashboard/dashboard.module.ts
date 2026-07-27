import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { Lead } from '../leads/entities/lead.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [TypeOrmModule.forFeature([FollowUp, Lead, UserInformations])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}

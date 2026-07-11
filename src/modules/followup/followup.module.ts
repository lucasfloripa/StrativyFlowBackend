import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUpController } from './controllers/followup.controller'
import { FollowUp } from './entities/followup.entity'
import { FollowUpService } from './services/followup.service'

@Module({
  imports: [TypeOrmModule.forFeature([FollowUp])],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService]
})
export class FollowUpModule {}

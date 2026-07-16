import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'

import { Negotiation } from './entities/negotiation.entity'
import { NegotiationController } from './negotiation.controller'
import { NegotiationService } from './negotiation.service'

@Module({
  imports: [TypeOrmModule.forFeature([Negotiation, FollowUp])],
  controllers: [NegotiationController],
  providers: [NegotiationService],
  exports: [NegotiationService]
})
export class NegotiationModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Negotiation } from './entities/negotiation.entity'
import { NegotiationController } from './negotiation.controller'
import { NegotiationService } from './negotiation.service'

@Module({
  imports: [TypeOrmModule.forFeature([Negotiation])],
  controllers: [NegotiationController],
  providers: [NegotiationService],
  exports: [NegotiationService]
})
export class NegotiationModule {}

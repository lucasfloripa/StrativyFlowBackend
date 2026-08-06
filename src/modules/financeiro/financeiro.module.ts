import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Lead } from '../leads/entities/lead.entity'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroController } from './financeiro.controller'
import { FinanceiroService } from './financeiro.service'

@Module({
  imports: [TypeOrmModule.forFeature([Negotiation, Lead, UserInformations])],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  exports: [FinanceiroService]
})
export class FinanceiroModule {}
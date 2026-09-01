import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Message } from '../leads/entities/message.entity'
import { NegotiationCost } from '../negotiation/entities/negotiation-cost.entity'
import { NegotiationFinancial } from '../negotiation/entities/negotiation-financial.entity'
import { NegotiationPayment } from '../negotiation/entities/negotiation-payment.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroController } from './financeiro.controller'
import { FinanceiroService } from './financeiro.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      NegotiationCost,
      NegotiationFinancial,
      NegotiationPayment,
      UserInformations
    ])
  ],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  exports: [FinanceiroService]
})
export class FinanceiroModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUpStep } from '../followup/entities/followup-step.entity'
import { FollowUp } from '../followup/entities/followup.entity'
import { LeadChannelIdentity } from '../leads/entities/lead-channel-identity.entity'
import { Lead } from '../leads/entities/lead.entity'

import { NegotiationAttachment } from './entities/negotiation-attachment.entity'
import { NegotiationCost } from './entities/negotiation-cost.entity'
import { NegotiationFinancial } from './entities/negotiation-financial.entity'
import { NegotiationPayment } from './entities/negotiation-payment.entity'
import { Negotiation } from './entities/negotiation.entity'
import { NegotiationPaymentStatusService } from './services/negotiation-payment-status.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUp,
      FollowUpStep,
      Lead,
      LeadChannelIdentity,
      Negotiation,
      NegotiationAttachment,
      NegotiationCost,
      NegotiationFinancial,
      NegotiationPayment
    ])
  ],
  providers: [NegotiationPaymentStatusService],
  exports: [NegotiationPaymentStatusService]
})
export class NegotiationPaymentDomainModule {}

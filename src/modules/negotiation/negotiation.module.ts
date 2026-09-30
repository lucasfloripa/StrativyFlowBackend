import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { StorageModule } from '../storage/storage.module'

import { NegotiationAttachmentCollectionController } from './controllers/negotiation-attachment-collection.controller'
import { NegotiationAttachmentController } from './controllers/negotiation-attachment.controller'
import { NegotiationCostController } from './controllers/negotiation-cost.controller'
import { NegotiationFinancialController } from './controllers/negotiation-financial.controller'
import { NegotiationPaymentController } from './controllers/negotiation-payment.controller'
import { NegotiationAttachment } from './entities/negotiation-attachment.entity'
import { NegotiationCost } from './entities/negotiation-cost.entity'
import { NegotiationFinancial } from './entities/negotiation-financial.entity'
import { NegotiationPayment } from './entities/negotiation-payment.entity'
import { Negotiation } from './entities/negotiation.entity'
import { NegotiationPaymentDomainModule } from './negotiation-payment-domain.module'
import { NegotiationController } from './negotiation.controller'
import { NegotiationService } from './negotiation.service'
import { NegotiationAttachmentService } from './services/negotiation-attachment.service'
import { NegotiationCostService } from './services/negotiation-cost.service'
import { NegotiationFinancialService } from './services/negotiation-financial.service'
import { NegotiationPaymentService } from './services/negotiation-payment.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Negotiation,
      FollowUp,
      NegotiationAttachment,
      NegotiationFinancial,
      NegotiationCost,
      NegotiationPayment
    ]),
    StorageModule,
    NegotiationPaymentDomainModule
  ],
  controllers: [
    NegotiationController,
    NegotiationAttachmentController,
    NegotiationAttachmentCollectionController,
    NegotiationFinancialController,
    NegotiationCostController,
    NegotiationPaymentController
  ],
  providers: [
    NegotiationService,
    NegotiationAttachmentService,
    NegotiationFinancialService,
    NegotiationCostService,
    NegotiationPaymentService
  ],
  exports: [NegotiationService]
})
export class NegotiationModule {}

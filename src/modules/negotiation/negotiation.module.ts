import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { StorageModule } from '../storage/storage.module'

import { NegotiationAttachmentController } from './controllers/negotiation-attachment.controller'
import { NegotiationAttachment } from './entities/negotiation-attachment.entity'
import { Negotiation } from './entities/negotiation.entity'
import { NegotiationController } from './negotiation.controller'
import { NegotiationService } from './negotiation.service'
import { NegotiationAttachmentService } from './services/negotiation-attachment.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Negotiation, FollowUp, NegotiationAttachment]),
    StorageModule
  ],
  controllers: [NegotiationController, NegotiationAttachmentController],
  providers: [NegotiationService, NegotiationAttachmentService],
  exports: [NegotiationService]
})
export class NegotiationModule {}

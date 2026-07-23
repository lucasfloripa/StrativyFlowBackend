import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { RabbitModule } from '../rabbit/rabbit.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { StorageModule } from '../storage/storage.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { LeadMessagesController } from './controllers/lead-messages.controller'
import { Lead } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'
import { ChatMediaPolicyService } from './services/chat-media-policy.service'
import { LeadMessageApplicationService } from './services/lead-message-application.service'
import { LeadMessageContextService } from './services/lead-message-context.service'
import { LeadMessageDispatchService } from './services/lead-message-dispatch.service'
import { LeadMessageMetadataService } from './services/lead-message-metadata.service'
import { WhatsAppOutboundService } from './services/whatsapp-outbound.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Message, UserInformations, FollowUp]),
    RabbitModule,
    RealtimeModule,
    StorageModule
  ],
  controllers: [LeadsController, LeadMessagesController],
  providers: [
    LeadsService,
    LeadMessageApplicationService,
    LeadMessageContextService,
    LeadMessageDispatchService,
    LeadMessageMetadataService,
    WhatsAppOutboundService,
    ChatMediaPolicyService
  ],
  exports: [LeadsService]
})
export class LeadsModule {}

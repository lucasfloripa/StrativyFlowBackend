import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ContactsModule } from '../contacts/contacts.module'
import { FollowUp } from '../followup/entities/followup.entity'
import { FollowUpModule } from '../followup/followup.module'
import { RabbitModule } from '../rabbit/rabbit.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { StorageModule } from '../storage/storage.module'
import { UserInformations } from '../user/entities/user-informations.entity'
import { InstagramMessagingService } from '../webhook/instagram-messaging.service'
import { MessengerMessagingService } from '../webhook/messenger-messaging.service'
import { WhatsAppMessagingService } from '../webhook/whatsapp-messaging.service'

import { LeadMessagesController } from './controllers/lead-messages.controller'
import { LeadChannelIdentity } from './entities/lead-channel-identity.entity'
import { Lead } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'
import { AudioConverterService } from './services/audio-converter.service'
import { ChatMediaPolicyService } from './services/chat-media-policy.service'
import { LeadChannelIdentityService } from './services/lead-channel-identity.service'
import { LeadMessageApplicationService } from './services/lead-message-application.service'
import { LeadMessageContextService } from './services/lead-message-context.service'
import { LeadMessageDispatchService } from './services/lead-message-dispatch.service'
import { LeadMessageMetadataService } from './services/lead-message-metadata.service'
import { WhatsAppOutboundService } from './services/whatsapp-outbound.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadChannelIdentity,
      Message,
      UserInformations,
      FollowUp
    ]),
    RabbitModule,
    RealtimeModule,
    StorageModule,
    FollowUpModule,
    ContactsModule
  ],
  controllers: [LeadsController, LeadMessagesController],
  providers: [
    LeadsService,
    LeadMessageApplicationService,
    LeadMessageContextService,
    LeadMessageDispatchService,
    LeadMessageMetadataService,
    MessengerMessagingService,
    InstagramMessagingService,
    WhatsAppMessagingService,
    WhatsAppOutboundService,
    LeadChannelIdentityService,
    ChatMediaPolicyService,
    AudioConverterService
  ],
  exports: [LeadsService, LeadChannelIdentityService]
})
export class LeadsModule {}

import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LeadChannelIdentity } from '../leads/entities/lead-channel-identity.entity'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'
import { LeadMessageDispatchService } from '../leads/services/lead-message-dispatch.service'
import { MailModule } from '../mail/mail.module'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { RealtimeModule } from '../realtime/realtime.module'
import { StorageModule } from '../storage/storage.module'
import { UserInformations } from '../user/entities/user-informations.entity'
import { InstagramMessagingService } from '../webhook/instagram-messaging.service'
import { MessengerMessagingService } from '../webhook/messenger-messaging.service'
import { WhatsAppMessagingService } from '../webhook/whatsapp-messaging.service'

import { FollowUpStep } from './entities/followup-step.entity'
import { FollowUp } from './entities/followup.entity'
import { Template } from './entities/template.entity'
import { FollowUpConversationPolicy } from './services/followup-conversation-policy.service'
import { FollowUpExecutor } from './services/followup-executor.service'
import { FollowUpStepExecutor } from './services/followup-step-executor.service'
import { MetaWhatsAppClient } from './services/meta-whatsapp-client.service'
import { WhatsAppTemplateSender } from './services/whatsapp-template-sender.service'

@Module({
  imports: [
    HttpModule,
    MailModule,
    RealtimeModule,
    StorageModule,
    TypeOrmModule.forFeature([
      FollowUp,
      FollowUpStep,
      Lead,
      LeadChannelIdentity,
      Message,
      Negotiation,
      Template,
      UserInformations
    ])
  ],
  providers: [
    FollowUpExecutor,
    FollowUpStepExecutor,
    FollowUpConversationPolicy,
    MessengerMessagingService,
    InstagramMessagingService,
    WhatsAppMessagingService,
    LeadMessageDispatchService,
    MetaWhatsAppClient,
    WhatsAppTemplateSender
  ],
  exports: [FollowUpExecutor, MetaWhatsAppClient, WhatsAppTemplateSender]
})
export class FollowUpExecutionModule {}

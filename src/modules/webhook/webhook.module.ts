import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Company } from '../company/company.entity'
import { FollowUpStep } from '../followup/entities/followup-step.entity'
import { FollowUp } from '../followup/entities/followup.entity'
import { FollowUpModule } from '../followup/followup.module'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'
import { LeadsModule } from '../leads/leads.module'
import { RabbitModule } from '../rabbit/rabbit.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { StorageModule } from '../storage/storage.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { ConversationContextBuilder } from './flow/conversation-context.builder'
import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import { FollowUpReplyLinkerService } from './follow-up-reply-linker.service'
import { InboundEventInboxService } from './inbound/inbound-event-inbox.service'
import { InboundEventRecord } from './inbound/inbound-event.entity'
import { InstagramMessagingService } from './instagram-messaging.service'
import { MessengerMessagingService } from './messenger-messaging.service'
import {
  metaAppSecretsProvider,
  MetaWebhookSignatureGuard
} from './security/meta-webhook-signature.guard'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      FollowUp,
      FollowUpStep,
      InboundEventRecord,
      Lead,
      Message,
      UserInformations
    ]),
    FollowUpModule,
    LeadsModule,
    RabbitModule,
    RealtimeModule,
    StorageModule
  ],
  providers: [
    metaAppSecretsProvider,
    MetaWebhookSignatureGuard,
    WebhookService,
    FollowUpReplyLinkerService,
    InboundEventInboxService,
    MessengerMessagingService,
    InstagramMessagingService,
    ConversationContextBuilder,
    LeadFlowEngine,
    LeadFlowActionExecutor
  ],
  controllers: [WebhookController],
  exports: [InstagramMessagingService]
})
export class WebhookModule {}

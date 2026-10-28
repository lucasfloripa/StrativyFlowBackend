import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Company } from '../company/company.entity'
import { FollowUpStep } from '../followup/entities/followup-step.entity'
import { FollowUp } from '../followup/entities/followup.entity'
import { FollowUpModule } from '../followup/followup.module'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'
import { LeadsModule } from '../leads/leads.module'
import { OutboxModule } from '../outbox/outbox.module'
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
import { WebhookService } from './webhook.service'

/**
 * Everything that processes inbound Meta events, without HTTP: used by the
 * API (`WebhookModule`, synchronous mode and fast-ack) and by the worker
 * (`InboundEventWorker`).
 */
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
    OutboxModule,
    StorageModule
  ],
  providers: [
    WebhookService,
    FollowUpReplyLinkerService,
    InboundEventInboxService,
    MessengerMessagingService,
    InstagramMessagingService,
    ConversationContextBuilder,
    LeadFlowEngine,
    LeadFlowActionExecutor
  ],
  exports: [WebhookService, InboundEventInboxService, InstagramMessagingService]
})
export class WebhookProcessingModule {}

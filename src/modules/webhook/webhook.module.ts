import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AutomationModule } from '../automation/automation.module'
import { FollowUpAction } from '../followup/entities/followup-action.entity'
import { FollowUp } from '../followup/entities/followup.entity'
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
import { InstagramMessagingService } from './instagram-messaging.service'
import { MessengerMessagingService } from './messenger-messaging.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUp,
      FollowUpAction,
      Lead,
      Message,
      UserInformations
    ]),
    AutomationModule,
    LeadsModule,
    RabbitModule,
    RealtimeModule,
    StorageModule
  ],
  providers: [
    WebhookService,
    FollowUpReplyLinkerService,
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

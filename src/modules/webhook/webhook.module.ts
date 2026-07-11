import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AutomationModule } from '../automation/automation.module'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'
import { RabbitModule } from '../rabbit/rabbit.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { ConversationContextBuilder } from './flow/conversation-context.builder'
import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Message, UserInformations]),
    AutomationModule,
    RabbitModule
  ],
  providers: [
    WebhookService,
    ConversationContextBuilder,
    LeadFlowEngine,
    LeadFlowActionExecutor
  ],
  controllers: [WebhookController]
})
export class WebhookModule {}

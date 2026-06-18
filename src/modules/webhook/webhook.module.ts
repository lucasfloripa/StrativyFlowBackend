import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AutomationModule } from '../automation/automation.module'
import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'
import { LeadRecord } from '../leads/entities/lead-record.entity'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'

import { AI_PROVIDER } from './ai/ai-provider.interface'
import { AIRuntime } from './ai/ai-runtime'
import { FakeAIProvider } from './ai/fake-ai-provider'
import { OpenAIProvider } from './ai/openai-provider'
import { ConversationContextBuilder } from './flow/conversation-context.builder'
import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadRecord, Board, BoardColumn, Message]),
    AutomationModule
  ],
  providers: [
    WebhookService,
    ConversationContextBuilder,
    AIRuntime,
    FakeAIProvider,
    OpenAIProvider,
    {
      provide: AI_PROVIDER,
      useExisting: OpenAIProvider
    },
    LeadFlowEngine,
    LeadFlowActionExecutor
  ],
  controllers: [WebhookController]
})
export class WebhookModule {}

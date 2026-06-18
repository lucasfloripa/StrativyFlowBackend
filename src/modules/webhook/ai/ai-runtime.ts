import { Inject, Injectable, Logger } from '@nestjs/common'

import { ConversationContext } from '../flow/conversation-context.types'
import { build as buildConversationMemory } from '../flow/conversation-memory.builder'

import * as aiProviderInterface from './ai-provider.interface'
import { buildPrompt } from './prompt-builder'

type GenerateReplyParams = {
  conversationContext: ConversationContext
  latestMessage: string
}

type GenerateReplyResult = {
  reply: string
  prompt: string
}

@Injectable()
export class AIRuntime {
  constructor(
    @Inject(aiProviderInterface.AI_PROVIDER)
    private readonly aiProvider: aiProviderInterface.AIProvider
  ) {}

  private readonly logger = new Logger(AIRuntime.name)

  async generateReply(
    params: GenerateReplyParams
  ): Promise<GenerateReplyResult> {
    const { conversationContext, latestMessage } = params

    const memory = buildConversationMemory(conversationContext)
    const prompt = buildPrompt({
      memory,
      latestMessage
    })

    const reply = await this.aiProvider.generateReply(prompt)

    this.logger.debug(
      `AI runtime generated reply. leadId=${conversationContext.lead.id} promptLength=${prompt.length} replyLength=${reply.length}`
    )

    return {
      reply,
      prompt
    }
  }
}

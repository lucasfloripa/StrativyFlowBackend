import { MessageDirection } from '../../leads/entities/message.entity'

import { ConversationContext } from './conversation-context.types'
import { ConversationMemory } from './conversation-memory.types'

export function build(context: ConversationContext): ConversationMemory {
  const recentMessages = context.recentMessages.map((message) => ({
    direction:
      message.direction === MessageDirection.INBOUND ? 'USER' : 'ASSISTANT',
    content: message.content ?? ''
  }))

  return {
    leadName: context.lead.name ?? undefined,
    messageCount: context.recentMessages.length,
    recentMessages
  }
}

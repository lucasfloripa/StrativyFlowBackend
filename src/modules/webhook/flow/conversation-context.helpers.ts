import { Message, MessageDirection } from '../../leads/entities/message.entity'

import { ConversationContext } from './conversation-context.types'

export function getLastMessage(
  context: ConversationContext
): Message | undefined {
  const { recentMessages } = context

  if (recentMessages.length === 0) {
    return undefined
  }

  return recentMessages[recentMessages.length - 1]
}

export function getLastInboundMessage(
  context: ConversationContext
): Message | undefined {
  for (let index = context.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = context.recentMessages[index]

    if (message.direction === MessageDirection.INBOUND) {
      return message
    }
  }

  return undefined
}

export function getLastOutboundMessage(
  context: ConversationContext
): Message | undefined {
  for (let index = context.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = context.recentMessages[index]

    if (message.direction === MessageDirection.OUTBOUND) {
      return message
    }
  }

  return undefined
}

export function getMessageCount(context: ConversationContext): number {
  return context.recentMessages.length
}

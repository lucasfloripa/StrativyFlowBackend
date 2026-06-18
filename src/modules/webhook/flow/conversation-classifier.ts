import { getMessageCount } from './conversation-context.helpers'
import { ConversationContext } from './conversation-context.types'

export enum ConversationType {
  NEW = 'NEW',
  ONGOING = 'ONGOING'
}

export function classifyConversation(
  context: ConversationContext
): ConversationType {
  if (getMessageCount(context) <= 3) {
    return ConversationType.NEW
  }

  return ConversationType.ONGOING
}
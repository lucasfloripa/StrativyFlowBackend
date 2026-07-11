import { Lead } from '../../leads/entities/lead.entity'
import { Message } from '../../leads/entities/message.entity'

export type ConversationContext = {
  lead: Lead
  recentMessages: Message[]
}

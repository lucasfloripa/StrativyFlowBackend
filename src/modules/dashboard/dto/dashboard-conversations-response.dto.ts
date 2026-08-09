import { LeadRuntimeMode } from '../../leads/entities/lead.entity'
import { MessageDirection, MessageType } from '../../leads/entities/message.entity'

import { DashboardConversationFilter } from './dashboard-conversations-query.dto'

export type DashboardConversationStatus =
  | 'new'
  | 'today'
  | 'noResponse24h'

export type DashboardConversationItemDto = {
  leadId: string
  leadName: string
  source: string | null
  leadCreatedAt: Date
  lastMessageAt: Date
  lastMessage: string | null
  lastMessageDirection: MessageDirection
  lastMessageType: MessageType
  isNew: boolean
  status: DashboardConversationStatus | null
  runtimeMode: LeadRuntimeMode
}

export type DashboardConversationsResponseDto = {
  filter: DashboardConversationFilter
  counts: Record<DashboardConversationFilter, number>
  items: DashboardConversationItemDto[]
}
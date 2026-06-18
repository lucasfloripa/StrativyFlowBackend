export type ConversationMemoryMessage = {
  direction: string
  content: string
}

export type ConversationMemory = {
  leadName?: string
  initialContext?: string
  messageCount: number
  recentMessages: ConversationMemoryMessage[]
}

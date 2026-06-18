import { ConversationMemory } from '../flow/conversation-memory.types'

export type BuildPromptParams = {
  memory: ConversationMemory
  latestMessage: string
}

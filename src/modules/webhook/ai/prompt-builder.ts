import { BuildPromptParams } from './prompt.types'

export function buildPrompt(params: BuildPromptParams): string {
  const { memory, latestMessage } = params

  const historyLines =
    memory.recentMessages.length > 0
      ? memory.recentMessages.map((m) => `${m.direction}: ${m.content}`)
      : ['(no previous messages)']

  return [
    `Lead name: ${memory.leadName ?? ''}`,
    '',
    `Initial context: ${memory.initialContext ?? ''}`,
    '',
    `Message count: ${memory.messageCount}`,
    '',
    'Conversation History:',
    ...historyLines,
    '',
    `Latest message: ${latestMessage}`
  ].join('\n')
}

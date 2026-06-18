export const AI_PROVIDER = 'AI_PROVIDER'

export interface AIProvider {
  generateReply(prompt: string): Promise<string>
}

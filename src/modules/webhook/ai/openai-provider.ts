import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

import { AIProvider } from './ai-provider.interface'

type OpenAIResponseOutputContent = {
  type?: string
  text?: string
}

type OpenAIResponseOutputItem = {
  content?: OpenAIResponseOutputContent[]
}

type OpenAIResponsesApiResponse = {
  output_text?: string
  output?: OpenAIResponseOutputItem[]
}

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAIProvider.name)
  private readonly apiUrl = 'https://api.openai.com/v1/responses'
  private readonly model = 'gpt-5-mini'

  constructor() {
    this.logger.debug('AI provider selected: OpenAIProvider')
  }

  async generateReply(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    this.logger.debug(
      `OpenAI request starting. model=${this.model} promptLength=${prompt.length}`
    )

    try {
      const response = await axios.post<OpenAIResponsesApiResponse>(
        this.apiUrl,
        {
          model: this.model,
          input: [
            {
              role: 'system',
              content:
                'You are a customer support and sales assistant. Be concise, helpful, friendly and conversational. Answer in the same language used by the customer.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      )

      const generatedText = this.extractGeneratedText(response.data)

      if (!generatedText) {
        throw new Error('OpenAI Responses API returned an empty response text')
      }

      this.logger.debug(
        `OpenAI response received. model=${this.model} responseLength=${generatedText.length}`
      )

      return generatedText
    } catch (error: unknown) {
      if (this.isAxiosErrorLike(error)) {
        const status = error.response?.status
        const message =
          typeof error.response?.data === 'string'
            ? error.response.data
            : (error.message ?? 'unknown error')

        throw new Error(
          `OpenAI Responses API request failed${status ? ` (status ${status})` : ''}: ${message}`
        )
      }

      throw new Error(
        `OpenAI provider failed to generate reply: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  private extractGeneratedText(
    data: OpenAIResponsesApiResponse
  ): string | null {
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text.trim()
    }

    const contentTexts = (data.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((content) => content.type === 'output_text' && content.text)
      .map((content) => content.text?.trim() ?? '')
      .filter((text) => text.length > 0)

    if (contentTexts.length > 0) {
      return contentTexts.join('\n').trim()
    }

    return null
  }

  private isAxiosErrorLike(error: unknown): error is {
    response?: {
      status?: number
      data?: unknown
    }
    message?: string
  } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      'message' in error
    )
  }
}

import { Inject, Injectable } from '@nestjs/common'

export const EVOLUTION_API_CONFIG = Symbol('EVOLUTION_API_CONFIG')

export type EvolutionApiConfig = {
  baseUrl: string
  apiKey: string
  instance: string
}

type EvolutionSendTextResponse = Record<string, unknown>

const isEvolutionSendTextResponse = (
  value: unknown
): value is EvolutionSendTextResponse =>
  typeof value === 'object' && value !== null

@Injectable()
export class EvolutionClient {
  constructor(
    @Inject(EVOLUTION_API_CONFIG)
    private readonly apiConfig: EvolutionApiConfig
  ) {}

  async sendText(
    phone: string,
    message: string
  ): Promise<EvolutionSendTextResponse> {
    const endpoint = `/message/sendText/${encodeURIComponent(this.apiConfig.instance)}`
    const response = await fetch(`${this.apiConfig.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiConfig.apiKey
      },
      body: JSON.stringify({
        number: phone,
        text: message
      })
    })

    const responseText = await response.text()
    const payload: unknown =
      responseText.length > 0 ? JSON.parse(responseText) : {}

    if (!response.ok) {
      throw new Error(
        `Evolution API request failed with status ${response.status}.`
      )
    }

    if (!isEvolutionSendTextResponse(payload)) {
      throw new Error('Invalid Evolution API response payload.')
    }

    return payload
  }
}

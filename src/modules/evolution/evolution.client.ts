import { HttpService } from '@nestjs/axios'
import { Inject, Injectable } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'

export const EVOLUTION_API_CONFIG = Symbol('EVOLUTION_API_CONFIG')

export type EvolutionApiConfig = {
  baseUrl: string
  apiKey: string
  instance: string
}

@Injectable()
export class EvolutionClient {
  constructor(
    private readonly httpService: HttpService,
    @Inject(EVOLUTION_API_CONFIG)
    private readonly apiConfig: EvolutionApiConfig
  ) {}

  async sendText(phone: string, message: string): Promise<unknown> {
    const endpoint = `/message/sendText/${encodeURIComponent(this.apiConfig.instance)}`
    const response = await firstValueFrom(
      this.httpService.post(
        endpoint,
        {
          number: phone,
          text: message
        },
        {
          baseURL: this.apiConfig.baseUrl,
          headers: {
            apikey: this.apiConfig.apiKey
          }
        }
      )
    )

    return response.data
  }
}
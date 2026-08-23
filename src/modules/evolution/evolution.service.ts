import { Injectable } from '@nestjs/common'

import { EvolutionClient } from './evolution.client'

@Injectable()
export class EvolutionService {
  constructor(private readonly evolutionClient: EvolutionClient) {}

  async sendText(phone: string, message: string): Promise<unknown> {
    return this.evolutionClient.sendText(phone, message)
  }
}

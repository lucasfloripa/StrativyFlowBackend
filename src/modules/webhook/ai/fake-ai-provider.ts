import { Injectable, Logger } from '@nestjs/common'

import { AIProvider } from './ai-provider.interface'

@Injectable()
export class FakeAIProvider implements AIProvider {
  private readonly logger = new Logger(FakeAIProvider.name)

  generateReply(prompt: string): Promise<string> {
    this.logger.debug(`Generating fake AI reply. promptLength=${prompt.length}`)

    return Promise.resolve('Fake AI response')
  }
}

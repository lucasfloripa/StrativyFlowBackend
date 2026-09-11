import { Injectable, Logger } from '@nestjs/common'

import { FollowUpExecutor } from '../followup/services/followup-executor.service'
import { Message, MessageChannel } from '../leads/entities/message.entity'

@Injectable()
export class FollowUpReplyLinkerService {
  constructor(private readonly followUpExecutor: FollowUpExecutor) {}

  private readonly logger = new Logger(FollowUpReplyLinkerService.name)

  async linkReply(message: Message): Promise<number> {
    try {
      if (!Object.values(MessageChannel).includes(message.channel)) {
        return 0
      }

      return await this.followUpExecutor.processInboundReply(message)
    } catch (error) {
      this.logger.warn(
        `Failed to link inbound message ${message.id} to follow-ups: ${error instanceof Error ? error.message : 'unknown error'}`
      )
      return 0
    }
  }
}

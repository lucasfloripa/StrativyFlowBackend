import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  Message,
  MessageChannel,
  MessageDirection
} from '../../leads/entities/message.entity'

const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000

@Injectable()
export class FollowUpConversationPolicy {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>
  ) {}

  async isWithinMessagingWindow(
    leadId: string,
    channel: MessageChannel,
    referenceDate: Date = new Date()
  ): Promise<boolean> {
    const lastInboundMessage = await this.messageRepository.findOne({
      where: {
        leadId,
        channel,
        direction: MessageDirection.INBOUND
      },
      order: {
        createdAt: 'DESC'
      }
    })

    if (!lastInboundMessage) {
      return false
    }

    return (
      referenceDate.getTime() - lastInboundMessage.createdAt.getTime() <
      CONVERSATION_WINDOW_MS
    )
  }
}

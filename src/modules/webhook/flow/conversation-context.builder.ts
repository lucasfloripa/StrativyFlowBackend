import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Lead } from '../../leads/entities/lead.entity'
import { Message } from '../../leads/entities/message.entity'

import { ConversationContext } from './conversation-context.types'

@Injectable()
export class ConversationContextBuilder {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>
  ) {}

  private readonly logger = new Logger(ConversationContextBuilder.name)

  async build(params: { lead: Lead }): Promise<ConversationContext> {
    const { lead } = params

    const recentMessagesDesc = await this.messageRepo.find({
      where: { leadId: lead.id },
      order: { createdAt: 'DESC' },
      take: 10
    })

    const recentMessages = recentMessagesDesc.reverse()

    this.logger.debug(
      `ConversationContext loaded: leadId=${lead.id} messageCount=${recentMessages.length}`
    )

    return {
      lead,
      recentMessages
    }
  }
}
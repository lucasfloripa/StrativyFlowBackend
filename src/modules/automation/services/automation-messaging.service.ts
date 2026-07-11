import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { Repository } from 'typeorm'

import {
  Message,
  MessageDirection,
  MessageType
} from '../../leads/entities/message.entity'

type WhatsAppSendMessageResponse = {
  messaging_product: string
  contacts: {
    input: string
    wa_id: string
  }[]
  messages: {
    id: string
  }[]
}

@Injectable()
export class AutomationMessagingService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>
  ) {}

  private readonly logger = new Logger(AutomationMessagingService.name)

  async sendWhatsAppMessage(
    to: string,
    content: string,
    phoneNumberId?: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    return axios.post(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: content }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
  }

  async persistOutboundMessage(params: {
    correlationId?: string
    leadId: string
    content: string
    whatsappMessageId?: string | null
  }): Promise<void> {
    const { correlationId, leadId, content, whatsappMessageId } = params

    try {
      if (correlationId) {
        this.logger.debug(
          `[${correlationId}] Persisting outbound message for lead ${leadId}`
        )
      }

      await this.messageRepo.save(
        this.messageRepo.create({
          leadId,
          direction: MessageDirection.OUTBOUND,
          content,
          type: MessageType.TEXT,
          whatsappMessageId: whatsappMessageId ?? null
        })
      )
    } catch (error) {
      this.logger.warn(
        `Failed to persist outbound WhatsApp message: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }
}

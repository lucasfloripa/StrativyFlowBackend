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
    this.logger.log(
      `Sending WhatsApp message via automation service to=${to}, phoneNumberId=${phoneNumberId ?? 'missing'}`
    )

    try {
      const response = await axios.post<WhatsAppSendMessageResponse>(
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

      this.logger.log(
        `WhatsApp message sent via automation service to=${to}, whatsappMessageId=${response.data?.messages?.[0]?.id ?? 'unknown'}`
      )

      return { data: response.data }
    } catch (error) {
      const axiosError = error as { response?: { status?: number; data?: unknown } }
      this.logger.error(
        `Failed to send WhatsApp message via automation service to=${to}, status=${axiosError.response?.status ?? 'unknown'}, error=${error instanceof Error ? error.message : String(error)}`
      )
      this.logger.error(
        `WhatsApp API error response for to=${to}: ${JSON.stringify(axiosError.response?.data ?? null)}`
      )
      throw error
    }
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

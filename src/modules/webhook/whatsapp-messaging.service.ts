import { Injectable } from '@nestjs/common'
import axios from 'axios'

export type WhatsAppSendMessageResponse = {
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
export class WhatsAppMessagingService {
  async sendWhatsAppMessage(
    to: string,
    reply: string,
    phoneNumberId?: string,
    whatsappToken?: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    return sendWhatsAppMessage(to, reply, phoneNumberId, whatsappToken)
  }
}

export async function sendWhatsAppMessage(
  to: string,
  reply: string,
  phoneNumberId?: string,
  whatsappToken?: string
): Promise<{ data: WhatsAppSendMessageResponse }> {
  const token = whatsappToken?.trim()
  return axios.post(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: reply }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
}

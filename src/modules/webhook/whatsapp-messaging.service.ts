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

export type WhatsAppContact = {
  name: {
    formatted_name: string
    first_name?: string
    last_name?: string
  }
  phones: {
    phone: string
    type: 'CELL'
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

  async sendWhatsAppContact(
    to: string,
    contacts: WhatsAppContact[],
    phoneNumberId?: string,
    whatsappToken?: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    const token = whatsappToken?.trim()
    return axios.post(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'contacts',
        contacts
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )
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

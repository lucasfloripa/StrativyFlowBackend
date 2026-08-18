import { Injectable } from '@nestjs/common'
import axios from 'axios'

export type MessengerSendMessageResponse = {
  recipient_id: string
  message_id: string
}

export type MessengerAttachmentType = 'image' | 'audio' | 'video' | 'file'

export type MessengerSendAttachmentResponse = MessengerSendMessageResponse

export type MessengerUserInfoResponse = {
  first_name?: string
  last_name?: string
  profile_pic?: string
  id: string
}

@Injectable()
export class MessengerMessagingService {
  async sendMessengerMessage(
    to: string,
    reply: string,
    pageId?: string,
    messengerToken?: string
  ): Promise<{ data: MessengerSendMessageResponse }> {
    return sendMessengerMessage(to, reply, pageId, messengerToken)
  }

  async getMessengerUserInfo(
    psid: string,
    messengerToken?: string
  ): Promise<{ data: MessengerUserInfoResponse }> {
    return getMessengerUserInfo(psid, messengerToken)
  }

  async sendMessengerAttachment(
    to: string,
    type: MessengerAttachmentType,
    url: string,
    pageId?: string,
    messengerToken?: string
  ): Promise<{ data: MessengerSendAttachmentResponse }> {
    return sendMessengerAttachment(to, type, url, pageId, messengerToken)
  }
}

export async function sendMessengerMessage(
  to: string,
  reply: string,
  pageId?: string,
  messengerToken?: string
): Promise<{ data: MessengerSendMessageResponse }> {
  const token = messengerToken?.trim()

  return axios.post(
    `https://graph.facebook.com/v22.0/${pageId}/messages`,
    {
      recipient: {
        id: to
      },
      message: {
        text: reply
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
}

export async function getMessengerUserInfo(
  psid: string,
  messengerToken?: string
): Promise<{ data: MessengerUserInfoResponse }> {
  const token = messengerToken?.trim()

  return axios.get<MessengerUserInfoResponse>(
    `https://graph.facebook.com/v22.0/${psid}`,
    {
      params: {
        fields: 'first_name,last_name,profile_pic,id'
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
}

export async function sendMessengerAttachment(
  to: string,
  type: MessengerAttachmentType,
  url: string,
  pageId?: string,
  messengerToken?: string
): Promise<{ data: MessengerSendAttachmentResponse }> {
  const token = messengerToken?.trim()

  return axios.post(
    `https://graph.facebook.com/v22.0/${pageId}/messages`,
    {
      recipient: {
        id: to
      },
      message: {
        attachment: {
          type,
          payload: {
            url,
            is_reusable: true
          }
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
}

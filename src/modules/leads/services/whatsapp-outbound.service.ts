import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

import { StorageUploadFile } from '../../storage/storage.service'

import { OutboundMediaType } from './types/outbound-media.type'

export type WhatsAppOutboundTextResponse = {
  messaging_product: string
  contacts: {
    input: string
    wa_id: string
  }[]
  messages: {
    id: string
  }[]
}

type WhatsAppUploadMediaResponse = {
  id: string
}

@Injectable()
export class WhatsAppOutboundService {
  private readonly logger = new Logger(WhatsAppOutboundService.name)

  async sendTextMessage(
    to: string,
    content: string,
    phoneNumberId: string
  ): Promise<{ data: WhatsAppOutboundTextResponse }> {
    return this.postToMetaApi<WhatsAppOutboundTextResponse>({
      path: `/${phoneNumberId}/messages`,
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: content }
      },
      logContext: {
        operation: 'sendTextMessage',
        phoneNumberId,
        destination: to,
        messageType: 'text'
      }
    })
  }

  async uploadMedia(
    file: StorageUploadFile,
    phoneNumberId: string
  ): Promise<{ data: WhatsAppUploadMediaResponse }> {
    this.logger.debug('Uploading media to WhatsApp /media endpoint.', {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      phoneNumberId
    })

    const formData = new FormData()
    formData.append('messaging_product', 'whatsapp')
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname
    )
    formData.append('type', file.mimetype)

    const response = await this.postToMetaApi<WhatsAppUploadMediaResponse>({
      path: `/${phoneNumberId}/media`,
      payload: formData,
      includeJsonContentType: false,
      logContext: {
        operation: 'uploadMedia',
        phoneNumberId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      }
    })

    this.logger.debug('WhatsApp /media upload response received.', {
      phoneNumberId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      response: response.data
    })

    return response
  }

  async sendMediaMessage(params: {
    to: string
    phoneNumberId: string
    type: OutboundMediaType
    mediaId: string
    caption?: string
    fileName?: string
  }): Promise<{ data: WhatsAppOutboundTextResponse }> {
    const payload = this.buildMediaPayload(params)

    return this.postToMetaApi<WhatsAppOutboundTextResponse>({
      path: `/${params.phoneNumberId}/messages`,
      payload,
      logContext: {
        operation: 'sendMediaMessage',
        phoneNumberId: params.phoneNumberId,
        destination: params.to,
        messageType: params.type,
        mediaId: params.mediaId
      }
    })
  }

  private buildMediaPayload(params: {
    to: string
    type: OutboundMediaType
    mediaId: string
    caption?: string
    fileName?: string
  }): Record<string, unknown> {
    const { to, type, mediaId, caption, fileName } = params
    const trimmedCaption = caption?.trim() || undefined

    switch (type) {
      case 'audio':
        return {
          messaging_product: 'whatsapp',
          to,
          type,
          audio: { id: mediaId }
        }
      case 'image':
        return {
          messaging_product: 'whatsapp',
          to,
          type,
          image: {
            id: mediaId,
            ...(trimmedCaption ? { caption: trimmedCaption } : {})
          }
        }
      case 'video':
        return {
          messaging_product: 'whatsapp',
          to,
          type,
          video: {
            id: mediaId,
            ...(trimmedCaption ? { caption: trimmedCaption } : {})
          }
        }
      case 'document':
        return {
          messaging_product: 'whatsapp',
          to,
          type,
          document: {
            id: mediaId,
            ...(trimmedCaption ? { caption: trimmedCaption } : {}),
            ...(fileName?.trim() ? { filename: fileName.trim() } : {})
          }
        }
      default:
        return {
          messaging_product: 'whatsapp',
          to,
          type,
          audio: { id: mediaId }
        }
    }
  }

  private async postToMetaApi<TResponse>(params: {
    path: string
    payload: unknown
    includeJsonContentType?: boolean
    logContext: Record<string, unknown>
  }): Promise<{ data: TResponse }> {
    const includeJsonContentType = params.includeJsonContentType ?? true
    const headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }

    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json'
    }

    try {
      const response = await axios.post<TResponse>(
        `https://graph.facebook.com/v22.0${params.path}`,
        params.payload,
        {
          headers
        }
      )

      return { data: response.data }
    } catch (error) {
      const axiosError = error as {
        response?: {
          status?: number
          data?: unknown
        }
      }

      this.logger.error('WhatsApp outbound request failed.', {
        ...params.logContext,
        status: axiosError.response?.status ?? null,
        response: axiosError.response?.data ?? null,
        error: error instanceof Error ? error.message : String(error)
      })

      throw error
    }
  }
}

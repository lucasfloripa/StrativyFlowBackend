import { Injectable } from '@nestjs/common'
import axios from 'axios'

import { StorageUploadFile } from '../../storage/storage.service'

import { AudioConverterService } from './audio-converter.service'
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
  constructor(private readonly audioConverterService: AudioConverterService) {}

  async sendTextMessage(
    to: string,
    content: string,
    phoneNumberId: string,
    whatsappToken?: string
  ): Promise<{ data: WhatsAppOutboundTextResponse }> {
    return this.postToMetaApi<WhatsAppOutboundTextResponse>({
      path: `/${phoneNumberId}/messages`,
      payload: {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: content }
      },
      whatsappToken,
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
    phoneNumberId: string,
    whatsappToken?: string
  ): Promise<{ data: WhatsAppUploadMediaResponse }> {
    let bufferToUpload = file.buffer
    let mimeTypeToUpload = file.mimetype
    let fileNameToUpload = file.originalname

    // Convert WebM audio to MP3 before uploading to Meta
    if (this.audioConverterService.isWebmAudio(file.mimetype)) {
      try {
        const convertedAudio =
          await this.audioConverterService.convertWebmToOgg(file.buffer)

        // Validate converted buffer
        if (!convertedAudio.buffer || convertedAudio.buffer.length === 0) {
          throw new Error('Converted buffer is empty')
        }

        bufferToUpload = convertedAudio.buffer
        mimeTypeToUpload = convertedAudio.mimeType
        fileNameToUpload = file.originalname.replace(/\.webm$/i, '.mp3')
      } catch {
        // Continue with original file if conversion fails
      }
    }

    const formData = new FormData()
    formData.append('messaging_product', 'whatsapp')
    formData.append(
      'file',
      new Blob([new Uint8Array(bufferToUpload)], { type: mimeTypeToUpload }),
      fileNameToUpload
    )
    formData.append('type', mimeTypeToUpload)

    const response = await this.postToMetaApi<WhatsAppUploadMediaResponse>({
      path: `/${phoneNumberId}/media`,
      payload: formData,
      includeJsonContentType: false,
      whatsappToken,
      logContext: {
        operation: 'uploadMedia',
        phoneNumberId,
        originalFileName: file.originalname,
        uploadedFileName: fileNameToUpload,
        originalMimeType: file.mimetype,
        uploadedMimeType: mimeTypeToUpload,
        originalSize: file.size,
        uploadedSize: bufferToUpload.length,
        wasConverted: mimeTypeToUpload !== file.mimetype
      }
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
    whatsappToken?: string
  }): Promise<{ data: WhatsAppOutboundTextResponse }> {
    const payload = this.buildMediaPayload(params)

    return this.postToMetaApi<WhatsAppOutboundTextResponse>({
      path: `/${params.phoneNumberId}/messages`,
      payload,
      whatsappToken: params.whatsappToken,
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
    whatsappToken?: string
    logContext: Record<string, unknown>
  }): Promise<{ data: TResponse }> {
    const includeJsonContentType = params.includeJsonContentType ?? true
    const token = params.whatsappToken?.trim()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`
    }

    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await axios.post<TResponse>(
      `https://graph.facebook.com/v22.0${params.path}`,
      params.payload,
      {
        headers
      }
    )

    return { data: response.data }
  }
}

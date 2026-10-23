import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

import {
  buildMetaWhatsAppBaseUrl,
  MetaWhatsAppApiConfig
} from './meta-whatsapp-client.config'
import {
  MetaWhatsAppErrorResponseDto,
  MetaWhatsAppSendTemplateRequestDto,
  MetaWhatsAppSendTemplateSuccessDto
} from './meta-whatsapp-dto'

type AxiosLikeError<TResponse> = {
  response?: {
    data?: TResponse
    status?: number
  }
}

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name)

  constructor(private readonly configService: ConfigService) {}

  async sendTemplate(
    payload: MetaWhatsAppSendTemplateRequestDto,
    credentials: Pick<MetaWhatsAppApiConfig, 'phoneNumberId' | 'accessToken'>
  ): Promise<MetaWhatsAppSendTemplateSuccessDto> {
    const metaApiConfig = this.getMetaApiConfig(credentials)
    const endpoint = `${metaApiConfig.baseUrl}/${metaApiConfig.phoneNumberId}/messages`
    try {
      const { data } = await axios.post<MetaWhatsAppSendTemplateSuccessDto>(
        endpoint,
        payload,
        {
          headers: {
            Authorization: `Bearer ${metaApiConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      return data
    } catch (error: unknown) {
      if (this.isAxiosLikeError<MetaWhatsAppErrorResponseDto>(error)) {
        const metaError = error.response?.data?.error
        const statusCode = error.response?.status

        this.logger.warn(
          `Meta WhatsApp template request failed. status=${statusCode ?? 'unknown'} code=${metaError?.code ?? 'unknown'} type=${metaError?.type ?? 'unknown'} fbtraceId=${metaError?.fbtrace_id ?? 'unknown'}`
        )

        throw new BadGatewayException({
          message: 'Meta WhatsApp API request failed',
          metaError,
          statusCode
        })
      }

      throw new InternalServerErrorException(
        'Unexpected error while calling Meta WhatsApp API'
      )
    }
  }

  private isAxiosLikeError<TResponse>(
    value: unknown
  ): value is AxiosLikeError<TResponse> {
    return typeof value === 'object' && value !== null && 'response' in value
  }

  private getMetaApiConfig(
    credentials: Pick<MetaWhatsAppApiConfig, 'phoneNumberId' | 'accessToken'>
  ): MetaWhatsAppApiConfig {
    const apiVersion = this.configService.getOrThrow<string>(
      'WHATSAPP_API_VERSION'
    )

    return {
      baseUrl: buildMetaWhatsAppBaseUrl(apiVersion),
      phoneNumberId: credentials.phoneNumberId,
      accessToken: credentials.accessToken
    }
  }
}

import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

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
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}

  async sendTemplate(
    payload: MetaWhatsAppSendTemplateRequestDto
  ): Promise<MetaWhatsAppSendTemplateSuccessDto> {
    const metaApiConfig = this.getMetaApiConfig()
    const endpoint = `${metaApiConfig.baseUrl}/${metaApiConfig.phoneNumberId}/messages`
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<MetaWhatsAppSendTemplateSuccessDto>(
          endpoint,
          payload,
          {
            headers: {
              Authorization: `Bearer ${metaApiConfig.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        )
      )

      return data
    } catch (error: unknown) {
      if (this.isAxiosLikeError<MetaWhatsAppErrorResponseDto>(error)) {
        const metaError = error.response?.data?.error
        const statusCode = error.response?.status

        console.log(JSON.stringify(error.response?.data, null, 2))

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

  private getMetaApiConfig(): MetaWhatsAppApiConfig {
    const apiVersion = this.configService.getOrThrow<string>(
      'WHATSAPP_API_VERSION'
    )

    return {
      baseUrl: buildMetaWhatsAppBaseUrl(apiVersion),
      phoneNumberId: this.configService.getOrThrow<string>(
        'WHATSAPP_PHONE_NUMBER_ID'
      ),
      accessToken: this.configService.getOrThrow<string>('WHATSAPP_TOKEN')
    }
  }
}

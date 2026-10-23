import {
  BadGatewayException,
  InternalServerErrorException,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

import { MetaWhatsAppClient } from './meta-whatsapp-client.service'
import { MetaWhatsAppSendTemplateRequestDto } from './meta-whatsapp-dto'

describe('MetaWhatsAppClient', () => {
  const payload: MetaWhatsAppSendTemplateRequestDto = {
    messaging_product: 'whatsapp',
    to: '5548999990000',
    type: 'template',
    template: {
      name: 'followup_reminder',
      language: { code: 'pt_BR' }
    }
  }
  const credentials = {
    phoneNumberId: 'phone-number-id',
    accessToken: 'access-token'
  }

  const buildClient = (): MetaWhatsAppClient => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('v22.0')
    } as unknown as ConfigService

    return new MetaWhatsAppClient(configService)
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('sendTemplate', () => {
    it('posts the template to the phone number endpoint and returns the response body', async () => {
      const responseBody = { messages: [{ id: 'wamid.123' }] }
      const post = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: responseBody })

      await expect(
        buildClient().sendTemplate(payload, credentials)
      ).resolves.toEqual(responseBody)

      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/phone-number-id/messages',
        payload,
        {
          headers: {
            Authorization: 'Bearer access-token',
            'Content-Type': 'application/json'
          }
        }
      )
    })

    it('rejects with BadGatewayException when the Meta API answers with an error', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid parameter',
              type: 'OAuthException',
              code: 100
            }
          }
        }
      })

      const result = buildClient().sendTemplate(payload, credentials)

      await expect(result).rejects.toBeInstanceOf(BadGatewayException)
      await expect(result).rejects.toMatchObject({
        response: {
          message: 'Meta WhatsApp API request failed',
          statusCode: 400,
          metaError: { code: 100 }
        }
      })
    })

    it('logs only technical fields of a Meta API error', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined)
      jest.spyOn(axios, 'post').mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Recipient 5548999990000 is not a valid user',
              type: 'OAuthException',
              code: 131026,
              fbtrace_id: 'trace-1',
              error_data: { details: 'Recipient 5548999990000 not found' }
            }
          }
        }
      })

      await expect(
        buildClient().sendTemplate(payload, credentials)
      ).rejects.toBeInstanceOf(BadGatewayException)

      const logged = JSON.stringify(warn.mock.calls)
      expect(logged).toContain('code=131026')
      expect(logged).toContain('fbtraceId=trace-1')
      expect(logged).not.toContain('5548999990000')
    })

    it('rejects with InternalServerErrorException on an unexpected error', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue(new Error('socket hang up'))

      await expect(
        buildClient().sendTemplate(payload, credentials)
      ).rejects.toBeInstanceOf(InternalServerErrorException)
    })
  })
})

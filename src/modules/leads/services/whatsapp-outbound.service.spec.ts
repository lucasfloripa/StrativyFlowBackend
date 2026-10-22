import { BadRequestException } from '@nestjs/common'
import axios from 'axios'

import { WhatsAppOutboundService } from './whatsapp-outbound.service'

describe('WhatsAppOutboundService credentials', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each([undefined, '', '   '])(
    'rejects token %s before making an HTTP request',
    async (token) => {
      const post = jest.spyOn(axios, 'post')
      const service = new WhatsAppOutboundService({} as never)

      await expect(
        service.sendTextMessage(
          '5548999999999',
          'Hello',
          'company-phone-id',
          token
        )
      ).rejects.toBeInstanceOf(BadRequestException)

      expect(post).not.toHaveBeenCalled()
    }
  )

  it('uses the configured token in the Meta Authorization header', async () => {
    const response = { messages: [{ id: 'wamid.outbound' }] }
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: response })
    const service = new WhatsAppOutboundService({} as never)

    await expect(
      service.sendTextMessage(
        '5548999999999',
        'Hello',
        'company-phone-id',
        ' company-token '
      )
    ).resolves.toEqual({ data: response })

    expect(post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v22.0/company-phone-id/messages',
      {
        messaging_product: 'whatsapp',
        to: '5548999999999',
        type: 'text',
        text: { body: 'Hello' }
      },
      {
        headers: {
          Authorization: 'Bearer company-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })
})

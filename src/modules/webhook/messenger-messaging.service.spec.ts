import { BadRequestException } from '@nestjs/common'
import axios from 'axios'

import { MessengerMessagingService } from './messenger-messaging.service'

describe('MessengerMessagingService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('sends text using the supplied Company page and token', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { message_id: 'mid-1' } })
    await new MessengerMessagingService().sendMessengerMessage(
      'psid-1',
      'Hello',
      'page-1',
      ' company-token '
    )
    expect(post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v22.0/page-1/messages',
      { recipient: { id: 'psid-1' }, message: { text: 'Hello' } },
      {
        headers: {
          Authorization: 'Bearer company-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })

  it.each(['image', 'audio', 'video', 'file'] as const)(
    'sends %s attachments with Company credentials',
    async (type) => {
      const post = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { message_id: 'mid-1' } })
      await new MessengerMessagingService().sendMessengerAttachment(
        'psid-1',
        type,
        'https://storage.test/file',
        'page-1',
        'company-token'
      )
      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/page-1/messages',
        {
          recipient: { id: 'psid-1' },
          message: {
            attachment: {
              type,
              payload: { url: 'https://storage.test/file', is_reusable: true }
            }
          }
        },
        {
          headers: {
            Authorization: 'Bearer company-token',
            'Content-Type': 'application/json'
          }
        }
      )
    }
  )

  it('loads the user profile using Company credentials', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { id: 'psid-1' } })
    await new MessengerMessagingService().getMessengerUserInfo(
      'psid-1',
      'company-token'
    )
    expect(get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v22.0/psid-1',
      {
        params: { fields: 'first_name,last_name,profile_pic,id' },
        headers: {
          Authorization: 'Bearer company-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })

  it.each([undefined, '', '  '])(
    'rejects empty token %s without any external call',
    async (token) => {
      const post = jest.spyOn(axios, 'post')
      const get = jest.spyOn(axios, 'get')
      const service = new MessengerMessagingService()
      await expect(
        service.sendMessengerMessage('psid-1', 'Hello', 'page-1', token)
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.sendMessengerAttachment(
          'psid-1',
          'image',
          'https://storage.test/image',
          'page-1',
          token
        )
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.getMessengerUserInfo('psid-1', token)
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(post).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    }
  )
})

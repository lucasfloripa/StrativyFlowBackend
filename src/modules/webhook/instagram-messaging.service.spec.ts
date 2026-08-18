import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import axios from 'axios'
import { Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { InstagramMessagingService } from './instagram-messaging.service'

jest.mock('axios')

describe('InstagramMessagingService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>
  let userInformationsRepo: jest.Mocked<
    Pick<Repository<UserInformations>, 'findOne'>
  >
  let service: InstagramMessagingService

  beforeEach(() => {
    jest.clearAllMocks()
    userInformationsRepo = {
      findOne: jest.fn()
    }
    service = new InstagramMessagingService(
      userInformationsRepo as unknown as Repository<UserInformations>
    )
  })

  it('gets a typed Instagram profile using the configured account token', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.get.mockResolvedValue({
      data: {
        id: '2135646367302892',
        name: 'Lucas Gonçalves',
        username: 'lucasg.floripa',
        profile_pic: 'https://instagram.example/profile.jpg'
      }
    })

    await expect(
      service.getInstagramUserProfile(
        ' 17841436895629883 ',
        ' 2135646367302892 '
      )
    ).resolves.toEqual({
      id: '2135646367302892',
      name: 'Lucas Gonçalves',
      username: 'lucasg.floripa',
      profile_pic: 'https://instagram.example/profile.jpg'
    })

    expect(userInformationsRepo.findOne).toHaveBeenCalledWith({
      where: { instagramAccountId: '17841436895629883' }
    })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.instagram.com/v23.0/2135646367302892',
      {
        params: { fields: 'name,username,profile_pic' },
        headers: {
          Authorization: 'Bearer instagram-user-access-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })

  it('rejects an empty Instagram Account ID', async () => {
    await expect(
      service.getInstagramUserProfile(' ', '2135646367302892')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
  })

  it('rejects an empty Instagram User ID', async () => {
    await expect(
      service.getInstagramUserProfile('17841436895629883', ' ')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
  })

  it('rejects an unknown Instagram Account ID', async () => {
    userInformationsRepo.findOne.mockResolvedValue(null)

    await expect(
      service.getInstagramUserProfile('17841436895629883', '2135646367302892')
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects an account without an Instagram token', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: null
    } as UserInformations)

    await expect(
      service.getInstagramUserProfile('17841436895629883', '2135646367302892')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('translates invalid or expired tokens without exposing the token', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'secret-instagram-token'
    } as UserInformations)
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 400,
        data: { error: { code: 190, type: 'OAuthException' } }
      }
    })

    const request = service.getInstagramUserProfile(
      '17841436895629883',
      '2135646367302892'
    )

    await expect(request).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(request).rejects.not.toThrow('secret-instagram-token')
  })

  it('translates an invalid Instagram User ID', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 400,
        data: { error: { code: 100 } }
      }
    })

    await expect(
      service.getInstagramUserProfile(
        '17841436895629883',
        'invalid-instagram-user-id'
      )
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects an invalid Meta response', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.get.mockResolvedValue({ data: { username: 123 } })

    await expect(
      service.getInstagramUserProfile('17841436895629883', '2135646367302892')
    ).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('sends a text message using the token configured for the Instagram account', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.post.mockResolvedValue({
      data: {
        recipient_id: '2135646367302892',
        message_id: 'instagram-message-1'
      }
    })

    await expect(
      service.sendMessage(
        ' 17841436895629883 ',
        ' 2135646367302892 ',
        ' Olá! Essa mensagem foi enviada pelo StrativyFlow '
      )
    ).resolves.toEqual({
      recipient_id: '2135646367302892',
      message_id: 'instagram-message-1'
    })

    expect(userInformationsRepo.findOne).toHaveBeenCalledWith({
      where: { instagramAccountId: '17841436895629883' }
    })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.instagram.com/v23.0/17841436895629883/messages',
      {
        recipient: { id: '2135646367302892' },
        message: {
          text: 'Olá! Essa mensagem foi enviada pelo StrativyFlow'
        }
      },
      {
        headers: {
          Authorization: 'Bearer instagram-user-access-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })

  it('rejects an empty message text before loading credentials', async () => {
    await expect(
      service.sendMessage('17841436895629883', '2135646367302892', ' ')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('rejects an empty recipient before loading credentials', async () => {
    await expect(
      service.sendMessage('17841436895629883', ' ', 'Olá')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
  })

  it('does not send when the Instagram token is not configured', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: null
    } as UserInformations)

    await expect(
      service.sendMessage('17841436895629883', '2135646367302892', 'Olá')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('translates send failures caused by an invalid token', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'secret-instagram-token'
    } as UserInformations)
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 401,
        data: { error: { code: 190, type: 'OAuthException' } }
      }
    })

    const request = service.sendMessage(
      '17841436895629883',
      '2135646367302892',
      'Olá'
    )

    await expect(request).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(request).rejects.not.toThrow('secret-instagram-token')
  })

  it('rejects an invalid send message response from Meta', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.post.mockResolvedValue({ data: { recipient_id: null } })

    await expect(
      service.sendMessage('17841436895629883', '2135646367302892', 'Olá')
    ).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('sends a reusable attachment through the Instagram Graph API', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.post.mockResolvedValue({
      data: {
        recipient_id: '2135646367302892',
        message_id: 'instagram-attachment-1'
      }
    })

    await expect(
      service.sendInstagramAttachment(
        ' 17841436895629883 ',
        ' 2135646367302892 ',
        'image',
        ' https://cdn.example.com/photo.jpg '
      )
    ).resolves.toEqual({
      recipient_id: '2135646367302892',
      message_id: 'instagram-attachment-1'
    })

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.instagram.com/v23.0/17841436895629883/messages',
      {
        recipient: { id: '2135646367302892' },
        message: {
          attachment: {
            type: 'image',
            payload: {
              url: 'https://cdn.example.com/photo.jpg'
            }
          }
        }
      },
      {
        headers: {
          Authorization: 'Bearer instagram-user-access-token',
          'Content-Type': 'application/json'
        }
      }
    )
  })

  it('rejects an empty attachment URL before loading credentials', async () => {
    await expect(
      service.sendInstagramAttachment(
        '17841436895629883',
        '2135646367302892',
        'image',
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('reports invalid attachment media without blaming the recipient', async () => {
    userInformationsRepo.findOne.mockResolvedValue({
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    } as UserInformations)
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 400,
        data: { error: { code: 100 } }
      }
    })

    await expect(
      service.sendInstagramAttachment(
        '17841436895629883',
        '2135646367302892',
        'audio',
        'https://cdn.example.com/audio.webm'
      )
    ).rejects.toThrow('Instagram attachment URL or media format is invalid')
  })
})

import { Repository } from 'typeorm'

import { UserInformations } from './entities/user-informations.entity'
import { UserService } from './user.service'

describe('UserService', () => {
  let service: UserService
  let userInformationsRepo: jest.Mocked<
    Pick<Repository<UserInformations>, 'create' | 'find' | 'findOne' | 'save'>
  >

  beforeEach(() => {
    userInformationsRepo = {
      create: jest.fn((entity) => entity as UserInformations),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity as UserInformations))
    }

    service = new UserService(
      userInformationsRepo as unknown as Repository<UserInformations>
    )
  })

  const createDto = {
    userId: ' user-1 ',
    email: ' USER@Example.com ',
    phoneNumber: ' +5511999999999 '
  }

  it('creates UserInformations without Messenger configuration', async () => {
    userInformationsRepo.findOne.mockResolvedValue(null)

    await service.createUserInformations(createDto)

    expect(userInformationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
        phoneNumber: '+5511999999999',
        messengerPageId: null,
        messengerToken: null,
        instagramAccountId: null,
        instagramToken: null
      })
    )
  })

  it('creates UserInformations with messengerPageId', async () => {
    userInformationsRepo.findOne.mockResolvedValue(null)

    await service.createUserInformations({
      ...createDto,
      messengerPageId: ' 983500754853885 '
    })

    expect(userInformationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messengerPageId: '983500754853885',
        messengerToken: null
      })
    )
  })

  it('creates UserInformations with messengerToken', async () => {
    userInformationsRepo.findOne.mockResolvedValue(null)

    await service.createUserInformations({
      ...createDto,
      messengerToken: ' page-access-token '
    })

    expect(userInformationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messengerPageId: null,
        messengerToken: 'page-access-token'
      })
    )
  })

  it('creates UserInformations with Instagram configuration', async () => {
    userInformationsRepo.findOne.mockResolvedValue(null)

    await service.createUserInformations({
      ...createDto,
      instagramAccountId: ' 17841436895629883 ',
      instagramToken: ' instagram-user-access-token '
    })

    expect(userInformationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        instagramAccountId: '17841436895629883',
        instagramToken: 'instagram-user-access-token'
      })
    )
  })

  it('updates messengerPageId without changing WhatsApp configuration', async () => {
    const existingUser = {
      userId: 'user-1',
      phoneNumberId: 'whatsapp-phone-id',
      whatsappToken: 'whatsapp-token'
    } as UserInformations

    userInformationsRepo.findOne.mockResolvedValue(existingUser)

    await service.updateUserInformationsPreferencesByUserId('user-1', {
      messengerPageId: ' new-page-id '
    })

    expect(userInformationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        messengerPageId: 'new-page-id',
        phoneNumberId: 'whatsapp-phone-id',
        whatsappToken: 'whatsapp-token'
      })
    )
  })

  it('updates messengerToken', async () => {
    const existingUser = {
      userId: 'user-1',
      messengerToken: 'old-token'
    } as UserInformations

    userInformationsRepo.findOne.mockResolvedValue(existingUser)

    await service.updateUserInformationsPreferencesByUserId('user-1', {
      messengerToken: ' new-token '
    })

    expect(userInformationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ messengerToken: 'new-token' })
    )
  })

  it('updates Instagram configuration without changing other integrations', async () => {
    const existingUser = {
      userId: 'user-1',
      phoneNumberId: 'whatsapp-phone-id',
      messengerPageId: 'messenger-page-id'
    } as UserInformations

    userInformationsRepo.findOne.mockResolvedValue(existingUser)

    await service.updateUserInformationsPreferencesByUserId('user-1', {
      instagramAccountId: ' 17841436895629883 ',
      instagramToken: ' instagram-user-access-token '
    })

    expect(userInformationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        instagramAccountId: '17841436895629883',
        instagramToken: 'instagram-user-access-token',
        phoneNumberId: 'whatsapp-phone-id',
        messengerPageId: 'messenger-page-id'
      })
    )
  })

  it('returns Messenger fields when finding UserInformations', async () => {
    const configuredUser = {
      userId: 'user-1',
      messengerPageId: 'page-id',
      messengerToken: 'page-token'
    } as UserInformations

    userInformationsRepo.find.mockResolvedValue([configuredUser])

    await expect(service.findByUserId('user-1')).resolves.toEqual([
      expect.objectContaining({
        messengerPageId: 'page-id',
        messengerToken: 'page-token'
      })
    ])
  })

  it('returns existing users without Messenger configuration', async () => {
    const existingUser = {
      userId: 'user-1',
      messengerPageId: null,
      messengerToken: null
    } as UserInformations

    userInformationsRepo.find.mockResolvedValue([existingUser])

    await expect(service.findByUserId('user-1')).resolves.toEqual([
      existingUser
    ])
  })

  it('normalizes and persists notification emails in lower case', async () => {
    const existingUser = {
      userId: 'user-1',
      notificationWhatsAppNumbers: ['+5511999999999'],
      notificationEmails: ['old@example.com']
    } as UserInformations

    userInformationsRepo.findOne.mockResolvedValue(existingUser)
    await service.updateUserInformationsNotificationsByUserId('user-1', {
      notificationEmails: ['  New@Example.COM  ', 'another@example.com ']
    })

    expect(userInformationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationEmails: ['new@example.com', 'another@example.com']
      })
    )
  })
})

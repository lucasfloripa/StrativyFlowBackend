import { Repository } from 'typeorm'

import { UserInformations } from './entities/user-informations.entity'
import { UserService } from './user.service'

describe('UserService', () => {
  let service: UserService
  let userInformationsRepo: jest.Mocked<Pick<Repository<UserInformations>, 'findOne' | 'save'>>

  beforeEach(() => {
    userInformationsRepo = {
      findOne: jest.fn(),
      save: jest.fn()
    }

    service = new UserService(userInformationsRepo as unknown as Repository<UserInformations>)
  })

  it('normalizes and persists notification emails in lower case', async () => {
    const existingUser = {
      userId: 'user-1',
      notificationWhatsAppNumbers: ['+5511999999999'],
      notificationEmails: ['old@example.com']
    } as UserInformations

    userInformationsRepo.findOne.mockResolvedValue(existingUser)
    userInformationsRepo.save.mockImplementation(async (entity) => entity as UserInformations)

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

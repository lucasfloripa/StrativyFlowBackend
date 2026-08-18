import { UserInformations } from './entities/user-informations.entity'
import { UserController } from './user.controller'
import { UserService } from './user.service'

describe('UserController', () => {
  const configuredUser = {
    id: 'user-informations-1',
    userId: 'user-1',
    phoneNumber: '+5511999999999',
    instagramAccountId: '17841436895629883',
    instagramToken: 'instagram-user-access-token'
  } as UserInformations

  it('does not expose instagramToken when listing UserInformations', async () => {
    const userService = {
      findByUserId: jest.fn().mockResolvedValue([configuredUser])
    }
    const controller = new UserController(userService as unknown as UserService)

    const response = await controller.listUserInformations({
      user: { id: 'user-1' }
    } as never)

    expect(response).toEqual([
      expect.objectContaining({
        instagramAccountId: '17841436895629883'
      })
    ])
    expect(response[0]).not.toHaveProperty('instagramToken')
  })

  it('does not expose instagramToken after creating UserInformations', async () => {
    const userService = {
      createUserInformations: jest.fn().mockResolvedValue(configuredUser)
    }
    const controller = new UserController(userService as unknown as UserService)

    const response = await controller.createUserInformations({
      userId: 'user-1',
      email: 'user@example.com',
      phoneNumber: '+5511999999999',
      instagramAccountId: '17841436895629883',
      instagramToken: 'instagram-user-access-token'
    })

    expect(response).toEqual(
      expect.objectContaining({
        instagramAccountId: '17841436895629883'
      })
    )
    expect(response).not.toHaveProperty('instagramToken')
  })
})

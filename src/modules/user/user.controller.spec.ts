import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ThrottlerGuard } from '@nestjs/throttler'

import { buildCompany, buildUserInformations } from '../../testing'
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard'

import { UserController } from './user.controller'
import { UserService } from './user.service'

describe('UserController', () => {
  const configuredUser = buildUserInformations({
    whatsappToken: 'user-whatsapp-secret',
    messengerPageId: 'page-id',
    messengerToken: 'user-messenger-secret',
    instagramAccountId: '17841436895629883',
    instagramToken: 'instagram-user-access-token',
    company: buildCompany({ name: 'Acme', whatsappToken: 'company-secret' })
  })
  const request = { user: { id: 'user-1' } } as never

  describe('listUserInformations', () => {
    it('does not expose channel tokens or channel ids', async () => {
      const userService = {
        findByUserId: jest.fn().mockResolvedValue([configuredUser])
      }
      const controller = new UserController(
        userService as unknown as UserService
      )

      const [response] = await controller.listUserInformations(request)

      expect(response).not.toHaveProperty('whatsappToken')
      expect(response).not.toHaveProperty('messengerToken')
      expect(response).not.toHaveProperty('instagramToken')
      expect(response).not.toHaveProperty('messengerPageId')
      expect(response).not.toHaveProperty('instagramAccountId')
    })

    it('returns the Company name without exposing the Company relation', async () => {
      const userService = {
        findByUserId: jest.fn().mockResolvedValue([configuredUser])
      }
      const controller = new UserController(
        userService as unknown as UserService
      )

      const [response] = await controller.listUserInformations(request)

      expect(response).toHaveProperty('companyName', 'Acme')
      expect(response).not.toHaveProperty('company')
    })
  })

  describe('createUserInformations', () => {
    it('rate limits before checking the admin API key', () => {
      const guards: unknown = Reflect.getMetadata(
        GUARDS_METADATA,
        UserController.prototype.createUserInformations
      )

      expect(guards).toEqual([ThrottlerGuard, AdminApiKeyGuard])
    })

    it('does not expose channel tokens after creating UserInformations', async () => {
      const userService = {
        createUserInformations: jest.fn().mockResolvedValue(configuredUser)
      }
      const controller = new UserController(
        userService as unknown as UserService
      )

      const response = await controller.createUserInformations({
        userId: 'user-1',
        email: 'user@example.com',
        phoneNumber: '+5511999999999',
        instagramAccountId: '17841436895629883',
        instagramToken: 'instagram-user-access-token'
      })

      expect(JSON.stringify(response)).not.toContain('secret')
      expect(JSON.stringify(response)).not.toContain(
        'instagram-user-access-token'
      )
    })
  })

  it.each([
    'listUserInformations',
    'updateUserInformationsNotifications',
    'updateUserInformationsPreferences',
    'updateUserInformationsShortcuts'
  ] as const)('keeps %s available to any authenticated user', (handler) => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      UserController.prototype[handler]
    )

    expect(guards ?? []).toEqual([])
  })
})

import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AdminApiKeyGuard } from './admin-api-key.guard'

const buildGuard = (adminApiKey?: string): AdminApiKeyGuard =>
  new AdminApiKeyGuard({
    get: jest.fn().mockReturnValue(adminApiKey)
  } as unknown as ConfigService)

const buildContext = (
  headers: Record<string, string | string[] | undefined>
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers, path: '/user/user-informations' })
    })
  }) as unknown as ExecutionContext

describe('AdminApiKeyGuard', () => {
  describe('canActivate', () => {
    it('accepts a request with the configured admin API key', () => {
      const guard = buildGuard('admin-key')

      expect(
        guard.canActivate(buildContext({ 'x-admin-api-key': 'admin-key' }))
      ).toBe(true)
    })

    it.each([
      ['the header is missing', undefined],
      ['the key is wrong', 'wrong-key'],
      ['the key only shares a prefix', 'admin-key-extra'],
      ['the key is empty', '']
    ])('rejects the request when %s', (_case, header) => {
      const guard = buildGuard('admin-key')

      expect(() =>
        guard.canActivate(buildContext({ 'x-admin-api-key': header }))
      ).toThrow(ForbiddenException)
    })

    it.each([
      ['not configured', undefined],
      ['blank', '   ']
    ])(
      'rejects every request when ADMIN_API_KEY is %s',
      (_case, configured) => {
        const guard = buildGuard(configured)

        expect(() =>
          guard.canActivate(buildContext({ 'x-admin-api-key': '   ' }))
        ).toThrow(ForbiddenException)
      }
    )
  })
})

import { ServiceUnavailableException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ThrottlerGuard } from '@nestjs/throttler'

import { HealthController } from './health.controller'

describe('HealthController', () => {
  const createController = (status: 'ok' | 'degraded' | 'down') => {
    const report = { status, database: status === 'down' ? 'down' : 'up' }
    const controller = new HealthController({
      check: jest.fn().mockResolvedValue(report)
    } as never)
    return { controller, report }
  }

  describe('check', () => {
    it.each(['ok', 'degraded'] as const)(
      'answers 200 with the report when %s',
      async (status) => {
        const { controller, report } = createController(status)

        await expect(controller.check()).resolves.toBe(report)
      }
    )

    it('answers 503 when the database is down', async () => {
      const { controller } = createController('down')

      await expect(controller.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException
      )
    })

    it('is public but rate limited', () => {
      const guards: unknown = Reflect.getMetadata(
        GUARDS_METADATA,
        HealthController.prototype.check
      )

      expect(guards).toEqual([ThrottlerGuard])
    })
  })
})

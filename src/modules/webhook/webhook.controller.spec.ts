import { Logger } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'

import {
  META_APP_SECRETS,
  MetaWebhookSignatureGuard
} from './security/meta-webhook-signature.guard'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

const guardsOf = (handler: keyof WebhookController): unknown[] => {
  const guards: unknown = Reflect.getMetadata(
    GUARDS_METADATA,
    WebhookController.prototype[handler]
  )

  return Array.isArray(guards) ? guards : []
}

describe('WebhookController', () => {
  let controller: WebhookController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: {} },
        { provide: META_APP_SECRETS, useValue: ['test-app-secret'] }
      ]
    }).compile()

    controller = module.get<WebhookController>(WebhookController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('signature verification', () => {
    it.each([
      'handleWhatsAppWebhook',
      'handleMessengerWebhook',
      'handleDirectWebhook'
    ] as const)('protects %s with the Meta signature guard', (handler) => {
      expect(guardsOf(handler)).toContain(MetaWebhookSignatureGuard)
    })

    it.each([
      'verifyWebhook',
      'verifyMessengerWebhook',
      'verifyDirectWebhook'
    ] as const)('leaves the %s subscription handshake unguarded', (handler) => {
      expect(guardsOf(handler)).toEqual([])
    })
  })

  describe('subscription handshake', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([
      'verifyWebhook',
      'verifyMessengerWebhook',
      'verifyDirectWebhook'
    ] as const)(
      'does not log the verify token when %s rejects a request',
      (handler) => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined)
        const consoleLog = jest
          .spyOn(console, 'log')
          .mockImplementation(() => undefined)
        const response = {
          status: jest.fn().mockReturnThis(),
          send: jest.fn()
        }

        controller[handler](
          'subscribe',
          'leaked-verify-token',
          'challenge-1',
          response as never
        )

        expect(response.status).toHaveBeenCalledWith(403)
        expect(consoleLog).not.toHaveBeenCalled()
        expect(JSON.stringify(warn.mock.calls)).not.toContain(
          'leaked-verify-token'
        )
      }
    )
  })
})

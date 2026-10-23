import { INestApplication, Logger } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import request from 'supertest'

import { RateLimitModule } from '../rate-limit/rate-limit.module'

import {
  META_APP_SECRETS,
  MetaWebhookSignatureGuard
} from './security/meta-webhook-signature.guard'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'

import type { App } from 'supertest/types'

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
      imports: [RateLimitModule],
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
    ] as const)(
      'guards the %s subscription handshake only with rate limiting',
      (handler) => {
        expect(guardsOf(handler)).toEqual([ThrottlerGuard])
      }
    )

    it.each([
      'handleWhatsAppWebhook',
      'handleMessengerWebhook',
      'handleDirectWebhook'
    ] as const)(
      'does not rate limit %s, so Meta delivery bursts are never dropped',
      (handler) => {
        expect(guardsOf(handler)).not.toContain(ThrottlerGuard)
      }
    )
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

  describe('rate limiting', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [RateLimitModule],
        controllers: [WebhookController],
        providers: [
          { provide: WebhookService, useValue: {} },
          { provide: META_APP_SECRETS, useValue: ['test-app-secret'] }
        ]
      }).compile()

      app = moduleRef.createNestApplication({ logger: false })
      await app.init()
    })

    afterAll(async () => {
      await app.close()
    })

    it('answers 429 after 10 handshake attempts per minute from one client', async () => {
      const attempt = () =>
        request(app.getHttpServer()).get('/webhook/whatsapp').query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'guess',
          'hub.challenge': 'challenge-1'
        })

      for (let i = 0; i < 10; i += 1) {
        await attempt().expect(403)
      }

      await attempt().expect(429)
    })
  })
})

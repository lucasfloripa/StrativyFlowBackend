import { INestApplication, ValidationPipe } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import request from 'supertest'

import { AdminApiKeyGuard } from '../../auth/admin-api-key.guard'
import { RateLimitModule } from '../../rate-limit/rate-limit.module'
import { InboundEventInboxService } from '../inbound/inbound-event-inbox.service'

import { WebhookAdminController } from './webhook-admin.controller'

import type { App } from 'supertest/types'

const ADMIN_KEY = 'test-admin-key'
const EVENT_ID = '7b1c2c3e-8f4a-4d5b-9c6d-0e1f2a3b4c5d'

describe('WebhookAdminController', () => {
  let app: INestApplication<App>
  const inboundEventInbox = {
    replayFailed: jest.fn().mockResolvedValue({ replayed: [EVENT_ID] })
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [WebhookAdminController],
      providers: [
        AdminApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ADMIN_API_KEY' ? ADMIN_KEY : undefined
          }
        },
        { provide: InboundEventInboxService, useValue: inboundEventInbox }
      ]
    })
      // The 5/min admin limit is asserted below; here it would cut the matrix.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe())
    await app.init()
  })

  afterAll(() => app.close())
  beforeEach(() => inboundEventInbox.replayFailed.mockClear())

  const replay = (body: object, key?: string) => {
    const call = request(app.getHttpServer()).post(
      '/admin/webhook/inbound-events/replay'
    )
    return (key ? call.set('X-Admin-Api-Key', key) : call).send(body)
  }

  describe('POST /admin/webhook/inbound-events/replay', () => {
    it('is rate limited before the admin key is checked', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, WebhookAdminController)
      ).toEqual([ThrottlerGuard, AdminApiKeyGuard])
    })

    it.each([
      ['without the admin key', undefined],
      ['with a wrong admin key', 'wrong-key']
    ])('refuses a request %s', async (_label, key) => {
      await replay({ ids: [EVENT_ID] }, key).expect(403)

      expect(inboundEventInbox.replayFailed).not.toHaveBeenCalled()
    })

    it('replays the failed events selected by the filter', async () => {
      const response = await replay(
        {
          conversationKey: 'whatsapp:phone-number-1:5548984296447',
          receivedFrom: '2026-10-28T00:00:00.000Z',
          receivedTo: '2026-10-29T00:00:00.000Z',
          limit: 50
        },
        ADMIN_KEY
      ).expect(200)

      expect(response.body).toEqual({ replayed: 1, ids: [EVENT_ID] })
      expect(inboundEventInbox.replayFailed).toHaveBeenCalledWith({
        ids: undefined,
        conversationKey: 'whatsapp:phone-number-1:5548984296447',
        receivedFrom: new Date('2026-10-28T00:00:00.000Z'),
        receivedTo: new Date('2026-10-29T00:00:00.000Z'),
        limit: 50
      })
    })

    it('replays specific events by ID', async () => {
      await replay({ ids: [EVENT_ID] }, ADMIN_KEY).expect(200)

      expect(inboundEventInbox.replayFailed).toHaveBeenCalledWith(
        expect.objectContaining({ ids: [EVENT_ID] })
      )
    })

    it('refuses to replay everything without a filter', async () => {
      await replay({ limit: 10 }, ADMIN_KEY).expect(400)

      expect(inboundEventInbox.replayFailed).not.toHaveBeenCalled()
    })

    it.each([
      ['an ID that is not a UUID', { ids: ['inbound-1'] }],
      ['a date that is not ISO 8601', { receivedFrom: 'yesterday' }],
      ['a limit above 500', { ids: [EVENT_ID], limit: 501 }]
    ])('rejects %s', async (_label, body) => {
      await replay(body, ADMIN_KEY).expect(400)

      expect(inboundEventInbox.replayFailed).not.toHaveBeenCalled()
    })
  })
})

import { Logger } from '@nestjs/common'

import {
  WEBHOOK_ASYNC_PROCESSING,
  WebhookIngestionService
} from './webhook-ingestion.service'

import type { ConfigService } from '@nestjs/config'

const whatsappPayload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: 'phone-number-1' },
            messages: [
              { id: 'wamid.1', from: '5548984296447', type: 'text' },
              { id: 'wamid.2', from: '5548984296447', type: 'text' }
            ]
          }
        }
      ]
    }
  ]
}

const messengerPayload = {
  entry: [
    {
      id: 'page-1',
      messaging: [
        { sender: { id: 'psid-1' }, message: { mid: 'm_1', text: 'Oi' } },
        { sender: { id: 'psid-1' }, message: { mid: 'm_2', is_echo: true } }
      ]
    }
  ]
}

const instagramPayload = {
  entry: [
    {
      id: 'ig-1',
      messaging: [
        { sender: { id: 'user-1' }, message: { mid: 'ig_1', text: 'Oi' } }
      ]
    }
  ]
}

describe('WebhookIngestionService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createService = (flag?: string) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === WEBHOOK_ASYNC_PROCESSING ? flag : undefined
      )
    }
    const webhookService = {
      handleIncomingMessage: jest.fn().mockResolvedValue({ status: 'sync' }),
      handleMessengerWebhook: jest.fn().mockResolvedValue({ status: 'sync' }),
      handleDirectWebhook: jest.fn().mockResolvedValue({ status: 'sync' })
    }
    const inboundEventInbox = {
      accept: jest.fn().mockResolvedValue({ accepted: 1, duplicates: 0 })
    }
    const service = new WebhookIngestionService(
      configService as unknown as ConfigService,
      webhookService as never,
      inboundEventInbox as never
    )

    return { service, webhookService, inboundEventInbox }
  }

  describe('isAsyncProcessingEnabled', () => {
    it.each([
      ['true', true],
      ['TRUE', true],
      [' 1 ', true],
      ['false', false],
      ['0', false],
      ['', false],
      [undefined, false]
    ])('reads %j as %s', (flag, expected) => {
      expect(createService(flag).service.isAsyncProcessingEnabled()).toBe(
        expected
      )
    })
  })

  describe('with WEBHOOK_ASYNC_PROCESSING off', () => {
    it('processes every channel in the request, as before', async () => {
      const { service, webhookService, inboundEventInbox } = createService()

      await expect(service.ingestWhatsApp(whatsappPayload)).resolves.toEqual({
        status: 'sync'
      })
      await service.ingestMessenger(messengerPayload)
      await service.ingestInstagram(instagramPayload)

      expect(webhookService.handleIncomingMessage).toHaveBeenCalledWith(
        whatsappPayload
      )
      expect(webhookService.handleMessengerWebhook).toHaveBeenCalledWith(
        messengerPayload
      )
      expect(webhookService.handleDirectWebhook).toHaveBeenCalledWith(
        instagramPayload
      )
      expect(inboundEventInbox.accept).not.toHaveBeenCalled()
    })
  })

  describe('with WEBHOOK_ASYNC_PROCESSING on (fast-ack)', () => {
    it('stores the normalized WhatsApp events and answers without processing', async () => {
      const { service, webhookService, inboundEventInbox } =
        createService('true')
      inboundEventInbox.accept.mockResolvedValue({ accepted: 1, duplicates: 1 })

      await expect(service.ingestWhatsApp(whatsappPayload)).resolves.toEqual({
        status: 'accepted',
        accepted: 1,
        duplicates: 1
      })

      const [events] = inboundEventInbox.accept.mock.calls[0] as [
        Array<{ dedupeKey: string }>
      ]
      expect(events.map((event) => event.dedupeKey)).toEqual([
        'wamid.1',
        'wamid.2'
      ])
      expect(webhookService.handleIncomingMessage).not.toHaveBeenCalled()
    })

    it('stores Messenger and Instagram events, without echoes', async () => {
      const { service, inboundEventInbox } = createService('true')

      await service.ingestMessenger(messengerPayload)
      await service.ingestInstagram(instagramPayload)

      const keys = inboundEventInbox.accept.mock.calls.map(
        ([events]: [Array<{ dedupeKey: string }>]) =>
          events.map((event) => event.dedupeKey)
      )
      expect(keys).toEqual([['m_1'], ['ig_1']])
    })

    it('fails when the events cannot be stored, so Meta redelivers', async () => {
      const { service, inboundEventInbox } = createService('true')
      inboundEventInbox.accept.mockRejectedValue(new Error('database down'))

      await expect(service.ingestWhatsApp(whatsappPayload)).rejects.toThrow(
        'database down'
      )
    })
  })
})

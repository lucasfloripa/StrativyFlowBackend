import { Logger } from '@nestjs/common'
import axios, { AxiosError, AxiosHeaders } from 'axios'

import { Company } from '../../company/company.entity'
import {
  Message,
  MessageChannel,
  MessageType
} from '../../leads/entities/message.entity'

import { InboundMediaService } from './inbound-media.service'

import type { InboundMediaState } from './inbound-media.constants'

const company = Object.assign(new Company(), {
  id: 'company-1',
  whatsappToken: 'whatsapp-token'
})

const httpError = (status?: number) =>
  new AxiosError(
    'request failed',
    status ? 'ERR_BAD_RESPONSE' : 'ETIMEDOUT',
    undefined,
    undefined,
    status
      ? {
          status,
          statusText: '',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: {}
        }
      : undefined
  )

const buildMessage = (
  overrides: Partial<Message> = {},
  media?: Partial<InboundMediaState>
): Message =>
  Object.assign(new Message(), {
    id: 'message-1',
    leadId: 'lead-1',
    channel: MessageChannel.WHATSAPP,
    type: MessageType.IMAGE,
    externalMessageId: 'wamid.image',
    mediaUrl: null,
    metadata: media
      ? {
          media: {
            source: { kind: 'whatsapp', metaMediaId: 'media-1' },
            companyId: 'company-1',
            attempts: 0,
            ...media
          }
        }
      : {},
    ...overrides
  })

const mockWhatsAppDownload = () =>
  jest
    .spyOn(axios, 'get')
    .mockResolvedValueOnce({
      data: {
        url: 'https://lookaside.fbsbx.com/media',
        mime_type: 'image/jpeg',
        file_size: 2048
      }
    })
    .mockResolvedValueOnce({ data: Buffer.from('image') })

describe('InboundMediaService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createService = (options: { async?: boolean } = {}) => {
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(buildMessage({}, {})),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const storageService = {
      uploadFile: jest
        .fn()
        .mockResolvedValue({ url: 'https://r2.test/leads/lead-1/file' })
    }
    const outboxService = { publish: jest.fn().mockResolvedValue(undefined) }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve({ id: message.id, mediaUrl: message.mediaUrl })
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = new InboundMediaService(
      messageRepo as never,
      companyRepo as never,
      storageService as never,
      outboxService as never,
      {
        get: (key: string) =>
          key === 'WEBHOOK_ASYNC_PROCESSING' && options.async
            ? 'true'
            : undefined
      } as never,
      leadsService as never,
      realtimeService as never
    )

    return {
      service,
      messageRepo,
      companyRepo,
      storageService,
      outboxService,
      realtimeService
    }
  }

  describe('attach', () => {
    it('with WEBHOOK_ASYNC_PROCESSING, records the source and leaves the download to the worker', async () => {
      const { service, messageRepo, outboxService } = createService({
        async: true
      })
      const get = jest.spyOn(axios, 'get')
      const message = buildMessage()

      await service.attach(message, company, {
        kind: 'whatsapp',
        metaMediaId: 'media-1'
      })

      expect(get).not.toHaveBeenCalled()
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'message-1' },
        {
          metadata: {
            media: {
              source: { kind: 'whatsapp', metaMediaId: 'media-1' },
              companyId: 'company-1',
              attempts: 0
            }
          }
        }
      )
      expect(outboxService.publish).toHaveBeenCalledWith(
        'message.media.fetch',
        { messageId: 'message-1' }
      )
    })

    it('without it, stores a WhatsApp file right away with the company token', async () => {
      const { service, storageService, messageRepo, realtimeService } =
        createService()
      const get = mockWhatsAppDownload()
      const message = buildMessage()

      await service.attach(message, company, {
        kind: 'whatsapp',
        metaMediaId: 'media-1'
      })

      expect(get).toHaveBeenNthCalledWith(
        1,
        'https://graph.facebook.com/v22.0/media-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer whatsapp-token'
          }) as unknown
        })
      )
      expect(storageService.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'image/jpeg', size: 5 }),
        { key: 'leads/lead-1/messages/message-1.jpg' }
      )
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'message-1' },
        {
          mediaUrl: 'https://r2.test/leads/lead-1/file',
          mimeType: 'image/jpeg',
          mediaSize: 2048
        }
      )
      expect(message.mediaUrl).toBe('https://r2.test/leads/lead-1/file')
      // message.created goes out afterwards, already with the file.
      expect(realtimeService.emitToLead).not.toHaveBeenCalled()
    })

    it('without it, stores a Messenger or Instagram file from the Meta CDN', async () => {
      const { service, storageService } = createService()
      jest.spyOn(axios, 'get').mockResolvedValue({
        data: Buffer.from('audio'),
        headers: { 'content-type': 'audio/mpeg; charset=binary' }
      })
      const message = buildMessage({
        channel: MessageChannel.MESSENGER,
        externalMessageId: 'm_1'
      })

      await service.attach(message, company, {
        kind: 'url',
        url: 'https://cdn.fbsbx.com/audio'
      })

      expect(storageService.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: 'm_1.mp3',
          mimetype: 'audio/mpeg'
        }),
        { key: 'leads/lead-1/messages/m_1.mp3' }
      )
    })

    it('without it, never downloads from a host outside the Meta CDN', async () => {
      const { service, storageService, messageRepo } = createService()
      const get = jest.spyOn(axios, 'get')

      await service.attach(buildMessage(), company, {
        kind: 'url',
        url: 'https://attacker.example/file'
      })

      expect(get).not.toHaveBeenCalled()
      expect(storageService.uploadFile).not.toHaveBeenCalled()
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'message-1' },
        {
          metadata: {
            media: expect.objectContaining({
              error: 'refused a non-Meta media host'
            }) as unknown
          }
        }
      )
    })

    it('without it, only records a failed download (the conversation goes on)', async () => {
      const { service } = createService()
      jest.spyOn(axios, 'get').mockRejectedValue(httpError())

      await expect(
        service.attach(buildMessage(), company, {
          kind: 'whatsapp',
          metaMediaId: 'media-1'
        })
      ).resolves.toBeUndefined()
    })
  })

  describe('fetchQueued', () => {
    it('stores the file, counts the attempt and tells the chat', async () => {
      const { service, messageRepo, realtimeService } = createService()
      mockWhatsAppDownload()

      await expect(service.fetchQueued('message-1', 4)).resolves.toBe('stored')

      expect(messageRepo.update).toHaveBeenNthCalledWith(
        1,
        { id: 'message-1' },
        {
          metadata: {
            media: expect.objectContaining({ attempts: 1 }) as unknown
          }
        }
      )
      expect(realtimeService.emitToLead).toHaveBeenCalledWith(
        'lead-1',
        'message.updated',
        { id: 'message-1', mediaUrl: 'https://r2.test/leads/lead-1/file' }
      )
    })

    it('rethrows a timeout for a retry before the last attempt', async () => {
      const { service } = createService()
      const timeout = httpError()
      jest.spyOn(axios, 'get').mockRejectedValue(timeout)

      await expect(service.fetchQueued('message-1', 4)).rejects.toBe(timeout)
    })

    it('records the error on the last attempt and tells the chat', async () => {
      const { service, messageRepo, realtimeService } = createService()
      messageRepo.findOne.mockResolvedValue(buildMessage({}, { attempts: 3 }))
      jest.spyOn(axios, 'get').mockRejectedValue(httpError(503))

      await expect(service.fetchQueued('message-1', 4)).resolves.toBe('failed')
      expect(messageRepo.update).toHaveBeenLastCalledWith(
        { id: 'message-1' },
        {
          metadata: {
            media: expect.objectContaining({
              attempts: 4,
              error: 'HTTP 503 ERR_BAD_RESPONSE'
            }) as unknown
          }
        }
      )
      expect(realtimeService.emitToLead).toHaveBeenCalledTimes(1)
    })

    it('gives up at once when Meta answers 4xx (expired media)', async () => {
      const { service } = createService()
      jest.spyOn(axios, 'get').mockRejectedValue(httpError(404))

      await expect(service.fetchQueued('message-1', 4)).resolves.toBe('failed')
    })

    it.each([
      ['already has the file', { mediaUrl: 'https://r2.test/file' }, {}],
      ['already gave up', {}, { error: 'HTTP 404' }]
    ])('does nothing when the message %s', async (_label, fields, media) => {
      const { service, messageRepo } = createService()
      messageRepo.findOne.mockResolvedValue(buildMessage(fields, media))
      const get = jest.spyOn(axios, 'get')

      await expect(service.fetchQueued('message-1', 4)).resolves.toBe(
        'already_stored'
      )
      expect(get).not.toHaveBeenCalled()
    })

    it('reports a message without a pending download', async () => {
      const { service, messageRepo } = createService()
      messageRepo.findOne.mockResolvedValue(buildMessage())

      await expect(service.fetchQueued('message-1', 4)).resolves.toBe('missing')
    })
  })
})

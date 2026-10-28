import { BadRequestException, Logger } from '@nestjs/common'
import axios, { AxiosError, AxiosHeaders } from 'axios'

import { Company } from '../../company/company.entity'
import { LeadRuntimeMode } from '../../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  MessageType
} from '../../leads/entities/message.entity'

import {
  AutomaticReplyService,
  isPermanentSendFailure
} from './automatic-reply.service'

const company = Object.assign(new Company(), {
  id: 'company-1',
  whatsappToken: 'whatsapp-token',
  messengerToken: 'messenger-token'
})

const axiosError = (status?: number) =>
  new AxiosError(
    'request failed',
    status ? 'ERR_BAD_RESPONSE' : 'ECONNRESET',
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

const queuedMessage = (overrides: Partial<Message> = {}): Message =>
  Object.assign(new Message(), {
    id: 'reply-1',
    leadId: 'lead-1',
    channel: MessageChannel.WHATSAPP,
    content: 'Olá! 👋',
    status: MessageStatus.QUEUED,
    externalMessageId: null,
    metadata: {
      runtimeMode: LeadRuntimeMode.AUTOMATION,
      outbound: {
        companyId: 'company-1',
        externalAccountId: 'phone-number-1',
        to: '5548984296447',
        attempts: 0
      }
    },
    ...overrides
  })

describe('AutomaticReplyService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const createService = (options: { async?: boolean } = {}) => {
    const messageRepo = {
      create: jest.fn((message: Partial<Message>) =>
        Object.assign(new Message(), message)
      ),
      save: jest.fn((message: Message) =>
        Promise.resolve(Object.assign(message, { id: 'reply-1' }))
      ),
      findOne: jest.fn().mockResolvedValue(queuedMessage()),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const leadRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) }
    const outboxService = { publish: jest.fn().mockResolvedValue(undefined) }
    const configService = {
      get: jest.fn((key: string) =>
        key === 'WEBHOOK_ASYNC_PROCESSING' && options.async ? 'true' : undefined
      )
    }
    const messengerMessagingService = {
      sendMessengerMessage: jest
        .fn()
        .mockResolvedValue({ data: { message_id: 'm_out' } })
    }
    const instagramMessagingService = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 'ig_out' })
    }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve({ id: message.id, status: message.status })
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = new AutomaticReplyService(
      messageRepo as never,
      companyRepo as never,
      leadRepo as never,
      outboxService as never,
      configService as never,
      messengerMessagingService as never,
      instagramMessagingService as never,
      leadsService as never,
      realtimeService as never
    )

    return {
      service,
      messageRepo,
      companyRepo,
      leadRepo,
      outboxService,
      messengerMessagingService,
      instagramMessagingService,
      realtimeService
    }
  }

  const queueParams = {
    leadId: 'lead-1',
    company,
    channel: MessageChannel.WHATSAPP,
    content: 'Olá! 👋',
    externalAccountId: 'phone-number-1',
    to: '5548984296447'
  }

  describe('queue', () => {
    it('stores the reply as queued before anything is sent', async () => {
      const { service, messageRepo } = createService({ async: true })

      await service.queue(queueParams)

      expect(messageRepo.create).toHaveBeenCalledWith({
        leadId: 'lead-1',
        direction: MessageDirection.AUTOMATIC,
        channel: MessageChannel.WHATSAPP,
        content: 'Olá! 👋',
        type: MessageType.TEXT,
        status: MessageStatus.QUEUED,
        externalMessageId: null,
        metadata: {
          runtimeMode: LeadRuntimeMode.AUTOMATION,
          outbound: {
            companyId: 'company-1',
            externalAccountId: 'phone-number-1',
            to: '5548984296447',
            attempts: 0
          }
        }
      })
    })

    it('with WEBHOOK_ASYNC_PROCESSING, leaves the send to the worker', async () => {
      const { service, outboxService } = createService({ async: true })
      const post = jest.spyOn(axios, 'post')

      await service.queue(queueParams)

      expect(outboxService.publish).toHaveBeenCalledWith(
        'message.outbound.send',
        { messageId: 'reply-1' }
      )
      expect(post).not.toHaveBeenCalled()
    })

    it('without it, sends right away and marks the reply sent', async () => {
      const { service, messageRepo, leadRepo, realtimeService, outboxService } =
        createService()
      const post = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { messages: [{ id: 'wamid.out' }] } })

      await service.queue(queueParams)

      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/phone-number-1/messages',
        expect.objectContaining({
          to: '5548984296447',
          text: { body: 'Olá! 👋' }
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer whatsapp-token'
          }) as unknown
        })
      )
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'reply-1' },
        { status: MessageStatus.SENT, externalMessageId: 'wamid.out' }
      )
      expect(leadRepo.update).toHaveBeenCalledWith(
        { id: 'lead-1' },
        { lastAutoReplyMessageId: 'wamid.out' }
      )
      expect(realtimeService.emitToLead).toHaveBeenCalledWith(
        'lead-1',
        'message.updated',
        { id: 'reply-1', status: MessageStatus.SENT }
      )
      expect(outboxService.publish).not.toHaveBeenCalled()
    })

    // Regression P5: a failed send after the reply was stored was lost.
    it('without it, keeps a reply that failed to send as failed, without throwing', async () => {
      const { service, messageRepo } = createService()
      jest.spyOn(axios, 'post').mockRejectedValue(axiosError(503))

      await expect(service.queue(queueParams)).resolves.toBeDefined()

      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'reply-1' },
        {
          status: MessageStatus.FAILED,
          metadata: expect.objectContaining({
            outbound: expect.objectContaining({
              error: 'HTTP 503 ERR_BAD_RESPONSE'
            }) as unknown
          }) as unknown
        }
      )
    })
  })

  describe('deliverQueued', () => {
    it('sends a queued WhatsApp reply and counts the attempt', async () => {
      const { service, messageRepo } = createService()
      jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { messages: [{ id: 'wamid.out' }] } })

      await expect(service.deliverQueued('reply-1', 4)).resolves.toBe('sent')

      expect(messageRepo.update).toHaveBeenNthCalledWith(
        1,
        { id: 'reply-1' },
        {
          metadata: expect.objectContaining({
            outbound: expect.objectContaining({ attempts: 1 }) as unknown
          }) as unknown
        }
      )
      expect(messageRepo.update).toHaveBeenLastCalledWith(
        { id: 'reply-1' },
        { status: MessageStatus.SENT, externalMessageId: 'wamid.out' }
      )
    })

    it('sends Messenger and Instagram replies with their own clients', async () => {
      const {
        service,
        messageRepo,
        messengerMessagingService,
        instagramMessagingService
      } = createService()
      messageRepo.findOne
        .mockResolvedValueOnce(
          queuedMessage({ channel: MessageChannel.MESSENGER })
        )
        .mockResolvedValueOnce(
          queuedMessage({ channel: MessageChannel.INSTAGRAM })
        )

      await service.deliverQueued('reply-1', 4)
      await service.deliverQueued('reply-1', 4)

      expect(
        messengerMessagingService.sendMessengerMessage
      ).toHaveBeenCalledWith(
        '5548984296447',
        'Olá! 👋',
        'phone-number-1',
        'messenger-token'
      )
      expect(instagramMessagingService.sendMessage).toHaveBeenCalledWith(
        'phone-number-1',
        '5548984296447',
        'Olá! 👋'
      )
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'reply-1' },
        { status: MessageStatus.SENT, externalMessageId: 'm_out' }
      )
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 'reply-1' },
        { status: MessageStatus.SENT, externalMessageId: 'ig_out' }
      )
    })

    it('rethrows a temporary failure for a retry before the last attempt', async () => {
      const { service, messageRepo } = createService()
      const failure = axiosError(500)
      jest.spyOn(axios, 'post').mockRejectedValue(failure)

      await expect(service.deliverQueued('reply-1', 4)).rejects.toBe(failure)
      expect(messageRepo.update).toHaveBeenCalledTimes(1)
    })

    it('marks the reply failed on the last attempt', async () => {
      const { service, messageRepo, realtimeService } = createService()
      messageRepo.findOne.mockResolvedValue(
        queuedMessage({
          metadata: {
            outbound: {
              companyId: 'company-1',
              externalAccountId: 'phone-number-1',
              to: '5548984296447',
              attempts: 3
            }
          }
        })
      )
      jest.spyOn(axios, 'post').mockRejectedValue(axiosError())

      await expect(service.deliverQueued('reply-1', 4)).resolves.toBe('failed')
      expect(messageRepo.update).toHaveBeenLastCalledWith(
        { id: 'reply-1' },
        expect.objectContaining({ status: MessageStatus.FAILED })
      )
      expect(realtimeService.emitToLead).toHaveBeenCalledWith(
        'lead-1',
        'message.updated',
        { id: 'reply-1', status: MessageStatus.FAILED }
      )
    })

    it('marks the reply failed at once when the Graph API refuses it (closed 24 h window)', async () => {
      const { service, messageRepo } = createService()
      jest.spyOn(axios, 'post').mockRejectedValue(axiosError(400))

      await expect(service.deliverQueued('reply-1', 4)).resolves.toBe('failed')
      expect(messageRepo.update).toHaveBeenLastCalledWith(
        { id: 'reply-1' },
        expect.objectContaining({ status: MessageStatus.FAILED })
      )
    })

    it.each([MessageStatus.SENT, MessageStatus.FAILED])(
      'does not send a reply that is already %s (redelivery)',
      async (status) => {
        const { service, messageRepo } = createService()
        messageRepo.findOne.mockResolvedValue(queuedMessage({ status }))
        const post = jest.spyOn(axios, 'post')

        await expect(service.deliverQueued('reply-1', 4)).resolves.toBe(
          'already_sent'
        )
        expect(post).not.toHaveBeenCalled()
        expect(messageRepo.update).not.toHaveBeenCalled()
      }
    )

    it('reports a reply that no longer exists', async () => {
      const { service, messageRepo } = createService()
      messageRepo.findOne.mockResolvedValue(null)

      await expect(service.deliverQueued('reply-404', 4)).resolves.toBe(
        'missing'
      )
    })

    it('marks the reply failed when its company is gone', async () => {
      const { service, companyRepo, messageRepo } = createService()
      companyRepo.findOne.mockResolvedValue(null)

      await expect(service.deliverQueued('reply-1', 4)).resolves.toBe('failed')
      expect(messageRepo.update).toHaveBeenLastCalledWith(
        { id: 'reply-1' },
        expect.objectContaining({ status: MessageStatus.FAILED })
      )
    })
  })

  describe('isPermanentSendFailure', () => {
    it.each([
      [axiosError(400), true],
      [axiosError(403), true],
      [axiosError(408), false],
      [axiosError(429), false],
      [axiosError(500), false],
      [axiosError(), false],
      [new BadRequestException('Instagram token is not configured'), true],
      [new Error('socket hang up'), false]
    ])('%s → %s', (error, expected) => {
      expect(isPermanentSendFailure(error)).toBe(expected)
    })
  })
})

import axios from 'axios'

import { Company } from '../company/company.entity'
import { LeadChannel } from '../leads/entities/lead-channel-identity.entity'
import {
  Lead,
  LeadFlowState,
  LeadQualification,
  LeadRuntimeMode,
  LeadState
} from '../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  MessageType
} from '../leads/entities/message.entity'

import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import { WebhookService, WhatsAppWebhookPayload } from './webhook.service'

describe('WebhookService', () => {
  const createService = (overrides?: {
    leadRepo?: object
    messageRepo?: object
    userInformationsRepo?: object
    conversationContextBuilder?: object
    leadFlowEngine?: object
    leadFlowActionExecutor?: object
    rabbitPublisherService?: object
    storageService?: object
    leadsService?: object
    leadChannelIdentityService?: object
    messengerMessagingService?: object
    instagramMessagingService?: object
    realtimeService?: object
    followUpReplyLinkerService?: object
    companyRepo?: object
  }) =>
    new WebhookService(
      (overrides?.leadRepo ?? {}) as never,
      (overrides?.messageRepo ?? {}) as never,
      (overrides?.userInformationsRepo ?? {}) as never,
      (overrides?.conversationContextBuilder ?? {}) as never,
      (overrides?.leadFlowEngine ?? {}) as never,
      (overrides?.leadFlowActionExecutor ?? {}) as never,
      (overrides?.rabbitPublisherService ?? {}) as never,
      (overrides?.storageService ?? {}) as never,
      (overrides?.leadsService ?? {}) as never,
      (overrides?.leadChannelIdentityService ?? {}) as never,
      (overrides?.messengerMessagingService ?? {}) as never,
      (overrides?.instagramMessagingService ?? {}) as never,
      (overrides?.realtimeService ?? {}) as never,
      (overrides?.followUpReplyLinkerService ?? {
        linkReply: jest.fn()
      }) as never,
      (overrides?.companyRepo ?? {}) as never
    )

  describe('WhatsApp Company ownership', () => {
    const createPayload = (
      metadata: {
        display_phone_number?: string
        phone_number_id?: string
      } = {
        display_phone_number: '5548999999999',
        phone_number_id: 'company-phone-id'
      }
    ): WhatsAppWebhookPayload => ({
      entry: [
        {
          changes: [
            {
              value: {
                metadata,
                messages: [
                  {
                    id: 'wamid.inbound',
                    from: '5548984296447',
                    type: 'text',
                    text: { body: 'Hello' }
                  }
                ]
              }
            }
          ]
        }
      ]
    })

    const createWhatsAppService = () => {
      const company = Object.assign(new Company(), {
        id: 'company-1',
        companyPhoneNumber: '5548999999999',
        companyPhoneNumberId: 'company-phone-id',
        whatsappToken: 'company-token'
      })
      const lead = Object.assign(new Lead(), {
        id: 'lead-1',
        companyId: company.id,
        name: 'Lead',
        runtimeMode: LeadRuntimeMode.HUMAN
      })
      const companyRepo = {
        findOne: jest.fn().mockResolvedValue(company),
        save: jest.fn((companyToSave: Company) =>
          Promise.resolve(companyToSave)
        )
      }
      const userInformationsRepo = { findOne: jest.fn(), save: jest.fn() }
      const leadRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        findOneOrFail: jest.fn().mockResolvedValue(lead),
        save: jest.fn((leadToSave: Lead) => Promise.resolve(leadToSave))
      }
      const messageRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((message: Partial<Message>) =>
          Object.assign(new Message(), message)
        ),
        save: jest.fn((message: Message) =>
          Promise.resolve(
            Object.assign(message, {
              id: 'message-1',
              createdAt: new Date('2026-10-16T10:00:00.000Z')
            })
          )
        )
      }
      const leadChannelIdentityService = {
        findIdentity: jest.fn().mockResolvedValue(null),
        findOrCreateLeadForIdentity: jest.fn(
          ({ leadDraft }: { leadDraft: Partial<Lead> }) =>
            Promise.resolve({
              identity: { id: 'identity-1' },
              lead: Object.assign(lead, leadDraft),
              leadCreated: true
            })
        )
      }
      const rabbitPublisherService = {
        publish: jest
          .fn<Promise<void>, [string, Record<string, unknown>]>()
          .mockResolvedValue(undefined)
      }
      const storageService = {
        uploadFile: jest
          .fn()
          .mockResolvedValue({ url: 'https://storage.test/image' })
      }
      const service = createService({
        companyRepo,
        userInformationsRepo,
        leadRepo,
        messageRepo,
        leadChannelIdentityService,
        rabbitPublisherService,
        storageService,
        leadFlowEngine: new LeadFlowEngine(),
        leadFlowActionExecutor: new LeadFlowActionExecutor(),
        leadsService: {
          toResponseMessageDto: jest.fn((message: Message) =>
            Promise.resolve(message)
          )
        },
        realtimeService: { emitToLead: jest.fn() },
        conversationContextBuilder: {
          build: jest.fn().mockResolvedValue({ lead, recentMessages: [] })
        }
      })

      return {
        service,
        company,
        companyRepo,
        userInformationsRepo,
        lead,
        leadRepo,
        messageRepo,
        leadChannelIdentityService,
        rabbitPublisherService,
        storageService
      }
    }

    afterEach(() => jest.restoreAllMocks())

    it('creates a Company lead and replies using its token without selecting a user', async () => {
      const dependencies = createWhatsAppService()
      const post = jest.spyOn(axios, 'post').mockResolvedValue({
        data: { messages: [{ id: 'wamid.outbound' }] }
      })

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({ status: 'created_and_replied', leadId: 'lead-1' })

      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { companyPhoneNumberId: 'company-phone-id' }
      })
      expect(dependencies.lead.companyId).toBe('company-1')
      expect(dependencies.lead.userInformationsId).toBeUndefined()
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
      expect(dependencies.userInformationsRepo.save).not.toHaveBeenCalled()
      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/company-phone-id/messages',
        expect.objectContaining({ to: '5548984296447' }),
        {
          headers: {
            Authorization: 'Bearer company-token',
            'Content-Type': 'application/json'
          }
        }
      )
      expect(dependencies.rabbitPublisherService.publish).toHaveBeenCalledWith(
        'lead.created',
        expect.objectContaining({ companyId: 'company-1' })
      )
      expect(dependencies.rabbitPublisherService.publish).toHaveBeenCalledWith(
        'message.received',
        expect.objectContaining({ companyId: 'company-1' })
      )
      for (const [, event] of dependencies.rabbitPublisherService.publish.mock
        .calls) {
        expect(event).not.toHaveProperty('userInformationsId')
        expect(event).not.toHaveProperty('userId')
      }
    })

    it('accepts account ID metadata without a display phone number', async () => {
      const dependencies = createWhatsAppService()
      jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [] } })

      await expect(
        dependencies.service.handleIncomingMessage(
          createPayload({
            phone_number_id: 'company-phone-id'
          })
        )
      ).resolves.toEqual({ status: 'created_and_replied', leadId: 'lead-1' })
    })

    it('falls back to the Company phone and fills an unconfigured account ID', async () => {
      const dependencies = createWhatsAppService()
      dependencies.company.companyPhoneNumberId = null
      dependencies.companyRepo.findOne.mockResolvedValueOnce(null)
      jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [] } })

      await dependencies.service.handleIncomingMessage(createPayload())

      expect(dependencies.companyRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { companyPhoneNumber: '5548999999999' }
      })
      expect(dependencies.companyRepo.save).toHaveBeenCalledWith(
        dependencies.company
      )
      expect(dependencies.company.companyPhoneNumberId).toBe('company-phone-id')
    })

    it('uses the configured Company account ID when only a phone is supplied', async () => {
      const dependencies = createWhatsAppService()
      jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [] } })

      await expect(
        dependencies.service.handleIncomingMessage(
          createPayload({
            display_phone_number: '5548999999999'
          })
        )
      ).resolves.toEqual({ status: 'created_and_replied', leadId: 'lead-1' })
      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { companyPhoneNumber: '5548999999999' }
      })
    })

    it('does not fall back to UserInformations when no Company is configured', async () => {
      const dependencies = createWhatsAppService()
      dependencies.companyRepo.findOne.mockResolvedValue(null)

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({ status: 'ignored_missing_company' })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
    })

    it('rejects a conflicting account ID instead of overwriting the Company account', async () => {
      const dependencies = createWhatsAppService()
      dependencies.companyRepo.findOne.mockResolvedValueOnce(null)
      dependencies.company.companyPhoneNumberId = 'different-account'

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({ status: 'ignored_company_account_mismatch' })
      expect(dependencies.companyRepo.save).not.toHaveBeenCalled()
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
    })

    it('rejects a lead identity belonging to another Company', async () => {
      const dependencies = createWhatsAppService()
      dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity.mockResolvedValue(
        {
          identity: { id: 'identity-1' },
          lead: Object.assign(new Lead(), { companyId: 'company-other' }),
          leadCreated: false
        }
      )

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({ status: 'ignored_identity_owner_mismatch' })
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
    })

    it('reuses an existing Company lead without requiring a user information binding', async () => {
      const dependencies = createWhatsAppService()
      dependencies.leadRepo.findOne.mockResolvedValue(dependencies.lead)
      dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity.mockResolvedValue(
        {
          identity: { id: 'identity-1' },
          lead: dependencies.lead,
          leadCreated: false
        }
      )

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({
        status: 'updated_human_mode_skipped',
        leadId: 'lead-1'
      })
      expect(dependencies.leadRepo.findOne).toHaveBeenCalledWith({
        where: [
          {
            companyId: 'company-1',
            phone: '5548984296447',
            state: LeadState.ACTIVE
          },
          {
            companyId: 'company-1',
            phone: '554884296447',
            state: LeadState.ACTIVE
          }
        ]
      })
    })

    it('uses the Company token for flow replies on an existing conversation', async () => {
      const dependencies = createWhatsAppService()
      dependencies.lead.runtimeMode = LeadRuntimeMode.AUTOMATION
      dependencies.lead.flowState = LeadFlowState.ASKING_NAME
      dependencies.lead.name = undefined
      dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity.mockResolvedValue(
        {
          identity: { id: 'identity-1' },
          lead: dependencies.lead,
          leadCreated: false
        }
      )
      const post = jest.spyOn(axios, 'post').mockResolvedValue({
        data: { messages: [{ id: 'wamid.reply' }] }
      })

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({ status: 'updated_and_replied', leadId: 'lead-1' })

      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/company-phone-id/messages',
        expect.objectContaining({ to: '5548984296447' }),
        {
          headers: {
            Authorization: 'Bearer company-token',
            'Content-Type': 'application/json'
          }
        }
      )
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
    })

    it('ignores duplicates before resolving the Company', async () => {
      const dependencies = createWhatsAppService()
      dependencies.messageRepo.findOne.mockResolvedValue({
        id: 'message-existing'
      })

      await expect(
        dependencies.service.handleIncomingMessage(createPayload())
      ).resolves.toEqual({
        status: 'ignored_duplicate_message',
        inboundMessageId: 'wamid.inbound'
      })
      expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
    })

    it('downloads inbound media using the Company token', async () => {
      const dependencies = createWhatsAppService()
      const get = jest
        .spyOn(axios, 'get')
        .mockResolvedValueOnce({
          data: { url: 'https://media.test/image', mime_type: 'image/jpeg' }
        })
        .mockResolvedValueOnce({ data: Buffer.from('image') })
      const payload = createPayload()
      const value = payload.entry![0].changes![0].value!
      value.messages = [
        {
          id: 'wamid.image',
          from: '5548984296447',
          type: 'image',
          image: { id: 'media-1', mime_type: 'image/jpeg' }
        }
      ]

      await expect(
        dependencies.service.handleIncomingMessage(payload)
      ).resolves.toEqual({
        status: 'media_message_processed',
        leadId: 'lead-1'
      })
      expect(get).toHaveBeenNthCalledWith(
        1,
        'https://graph.facebook.com/v22.0/media-1',
        {
          headers: {
            Authorization: 'Bearer company-token',
            'Content-Type': 'application/json'
          }
        }
      )
      expect(get).toHaveBeenNthCalledWith(2, 'https://media.test/image', {
        headers: {
          Authorization: 'Bearer company-token',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      })
      expect(dependencies.storageService.uploadFile).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores payloads without a WhatsApp entry', async () => {
    const service = createService()

    await expect(service.handleIncomingMessage({})).resolves.toEqual({
      status: 'ignored_missing_entry'
    })
  })

  it('emits WhatsApp message status updates in realtime', async () => {
    const message = {
      id: 'message-1',
      leadId: 'lead-1',
      channel: MessageChannel.WHATSAPP,
      externalMessageId: 'wamid.message-1',
      status: MessageStatus.SENT
    } as Message
    const responseMessage = {
      id: message.id,
      leadId: message.leadId,
      status: MessageStatus.DELIVERED
    }
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(message),
      save: jest.fn((updatedMessage: Message) =>
        Promise.resolve(updatedMessage)
      )
    }
    const leadsService = {
      toResponseMessageDto: jest.fn().mockResolvedValue(responseMessage)
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      leadsService,
      realtimeService
    })

    await expect(
      service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.message-1',
                      status: 'delivered'
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    ).resolves.toEqual({
      status: 'processed_status_updates',
      processedCount: 1
    })

    expect(message.status).toBe(MessageStatus.DELIVERED)
    expect(messageRepo.save).toHaveBeenCalledWith(message)
    expect(leadsService.toResponseMessageDto).toHaveBeenCalledWith(message)
    expect(realtimeService.emitToLead).toHaveBeenCalledWith(
      message.leadId,
      'message.updated',
      responseMessage
    )
  })

  it('persists an inbound WhatsApp contact message as contact', async () => {
    const lead = {
      id: 'lead-1',
      name: 'Lucas',
      companyId: 'company-1',
      lastInboundMessageId: 'wamid.previous'
    } as Lead
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((message: Message) => ({
        ...message,
        id: 'message-contact-1',
        createdAt: new Date('2026-08-18T18:40:49.000Z')
      })),
      save: jest.fn((message: Message) => Promise.resolve(message))
    }
    const realtimeService = { emitToLead: jest.fn() }
    const contacts = [
      {
        name: {
          first_name: 'Academia UP',
          formatted_name: 'Academia UP'
        },
        phones: [
          {
            phone: '+55 48 3257-7459',
            wa_id: '554832577459',
            type: 'CELL'
          }
        ],
        vcard: 'BEGIN:VCARD'
      }
    ]
    const service = createService({
      leadRepo: {
        findOneOrFail: jest.fn().mockResolvedValue(lead),
        save: jest.fn()
      },
      messageRepo,
      companyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'company-1',
          companyPhoneNumberId: '1051101894753146',
          whatsappToken: 'whatsapp-token'
        })
      },
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({ id: 'identity-1' }),
        findOrCreateLeadForIdentity: jest.fn().mockResolvedValue({
          identity: { id: 'identity-1' },
          lead,
          leadCreated: false
        })
      },
      rabbitPublisherService: { publish: jest.fn() },
      storageService: { uploadFile: jest.fn() },
      leadsService: {
        toResponseMessageDto: jest.fn((message: Message) =>
          Promise.resolve(message)
        )
      },
      realtimeService
    })

    await expect(
      service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {
                    display_phone_number: '554892194828',
                    phone_number_id: '1051101894753146'
                  },
                  contacts: [
                    {
                      profile: { name: 'Lucas Goncalves' },
                      wa_id: '554884296447'
                    }
                  ],
                  messages: [
                    {
                      from: '554884296447',
                      id: 'wamid.contact-1',
                      timestamp: '1787078449',
                      type: 'contacts',
                      contacts
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    ).resolves.toEqual({
      status: 'contact_message_processed',
      leadId: 'lead-1'
    })
    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.CONTACT,
        content: null,
        metadata: expect.objectContaining({ contacts }) as Record<
          string,
          unknown
        >
      })
    )
    expect(realtimeService.emitToLead).toHaveBeenCalledWith(
      'lead-1',
      'message.created',
      expect.objectContaining({ type: MessageType.CONTACT })
    )
  })

  it('preserves lead changes made while linking an inbound reply', async () => {
    let persistedLead = {
      id: 'lead-1',
      name: 'Lucas',
      companyId: 'company-1',
      runtimeMode: LeadRuntimeMode.HUMAN,
      leadQualification: null,
      lastInboundMessageId: 'wamid.previous'
    } as Lead
    const leadRepo = {
      findOneOrFail: jest.fn(() => Promise.resolve({ ...persistedLead })),
      save: jest.fn((lead: Lead) => {
        persistedLead = { ...lead }
        return Promise.resolve(lead)
      })
    }
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((message: Partial<Message>) => message as Message),
      save: jest.fn((message: Message) =>
        Promise.resolve({
          ...message,
          id: 'message-1',
          createdAt: new Date('2026-09-10T17:43:57.000Z')
        } as Message)
      )
    }
    const followUpReplyLinkerService = {
      linkReply: jest.fn(() => {
        persistedLead = {
          ...persistedLead,
          leadQualification: LeadQualification.QUALIFY
        }
        return Promise.resolve(1)
      })
    }
    const service = createService({
      leadRepo,
      messageRepo,
      companyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'company-1',
          companyPhoneNumberId: 'phone-number-id-1',
          whatsappToken: 'whatsapp-token'
        })
      },
      conversationContextBuilder: {
        build: jest.fn(({ lead }: { lead: Lead }) =>
          Promise.resolve({ lead, recentMessages: [] })
        )
      },
      rabbitPublisherService: { publish: jest.fn() },
      leadsService: {
        toResponseMessageDto: jest.fn((message: Message) =>
          Promise.resolve(message)
        )
      },
      realtimeService: { emitToLead: jest.fn() },
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({ id: 'identity-1' }),
        findOrCreateLeadForIdentity: jest.fn().mockResolvedValue({
          identity: { id: 'identity-1' },
          lead: { ...persistedLead },
          leadCreated: false
        })
      },
      followUpReplyLinkerService
    })

    await expect(
      service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {
                    display_phone_number: '5548999999999',
                    phone_number_id: 'phone-number-id-1'
                  },
                  contacts: [
                    {
                      profile: { name: 'Lucas' },
                      wa_id: '5548888888888'
                    }
                  ],
                  messages: [
                    {
                      from: '5548888888888',
                      id: 'wamid.reply-1',
                      timestamp: '1789062237',
                      type: 'text',
                      text: { body: 'Resposta' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    ).resolves.toEqual({
      status: 'updated_human_mode_skipped',
      leadId: 'lead-1'
    })

    expect(followUpReplyLinkerService.linkReply).toHaveBeenCalledTimes(1)
    expect(leadRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leadQualification: LeadQualification.QUALIFY
      })
    )
  })

  it('applies and removes a WhatsApp reaction on the target message', async () => {
    const targetMessage = {
      id: 'message-1',
      leadId: 'lead-1',
      channel: MessageChannel.WHATSAPP,
      externalMessageId: 'wamid.target',
      metadata: null
    } as Message
    const messageRepo = {
      findOne: jest.fn(({ where }: { where: { externalMessageId: string } }) =>
        Promise.resolve(
          where.externalMessageId === targetMessage.externalMessageId
            ? targetMessage
            : null
        )
      ),
      create: jest.fn(),
      save: jest.fn((message: Message) => Promise.resolve(message))
    }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      companyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'flow-user-1',
          companyPhoneNumberId: 'phone-number-id-1'
        })
      },
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({
          id: 'identity-1',
          leadId: 'lead-1'
        })
      },
      leadsService,
      realtimeService
    })
    const createPayload = (eventId: string, emoji: string | null) => ({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '5548999999999',
                  phone_number_id: 'phone-number-id-1'
                },
                messages: [
                  {
                    from: '5548888888888',
                    id: eventId,
                    timestamp: '1786838400',
                    type: 'reaction',
                    reaction: {
                      message_id: 'wamid.target',
                      emoji
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    })

    await expect(
      service.handleIncomingMessage(createPayload('wamid.reaction-1', '❤️'))
    ).resolves.toEqual({
      status: 'reaction_processed',
      messageId: 'message-1'
    })
    expect(targetMessage.metadata).toEqual({
      reaction: {
        emoji: '❤️',
        externalUserId: '5548888888888',
        reactedAt: '2026-08-16T00:00:00.000Z'
      }
    })

    await expect(
      service.handleIncomingMessage(createPayload('wamid.reaction-2', null))
    ).resolves.toEqual({
      status: 'reaction_removed',
      messageId: 'message-1'
    })
    expect(targetMessage.metadata).toBeNull()
    expect(messageRepo.create).not.toHaveBeenCalled()
    expect(realtimeService.emitToLead).toHaveBeenCalledTimes(2)
    expect(realtimeService.emitToLead).toHaveBeenLastCalledWith(
      'lead-1',
      'message.updated',
      targetMessage
    )
  })

  it('ignores a WhatsApp reaction when the target message does not exist', async () => {
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn()
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      companyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'flow-user-1',
          companyPhoneNumberId: 'phone-number-id-1'
        })
      },
      leadChannelIdentityService: { findIdentity: jest.fn() },
      leadsService: { toResponseMessageDto: jest.fn() },
      realtimeService
    })

    await expect(
      service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {
                    display_phone_number: '5548999999999',
                    phone_number_id: 'phone-number-id-1'
                  },
                  messages: [
                    {
                      from: '5548888888888',
                      id: 'wamid.reaction-missing',
                      type: 'reaction',
                      reaction: {
                        message_id: 'wamid.missing',
                        emoji: '👍'
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    ).resolves.toEqual({ status: 'ignored_reaction_target_not_found' })
    expect(messageRepo.save).not.toHaveBeenCalled()
    expect(realtimeService.emitToLead).not.toHaveBeenCalled()
  })

  it('applies and removes an Instagram Direct reaction on the target message', async () => {
    const targetMessage = {
      id: 'direct-message-1',
      leadId: 'lead-1',
      channel: MessageChannel.INSTAGRAM,
      externalMessageId: 'instagram-target-mid',
      metadata: null
    } as Message
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(targetMessage),
      create: jest.fn(),
      save: jest.fn((message: Message) => Promise.resolve(message))
    }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      leadRepo: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'lead-1', companyId: 'company-1' })
      },
      companyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'company-1',
          instagramAccountId: '17841436895629883'
        })
      },
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({
          id: 'identity-1',
          leadId: 'lead-1'
        })
      },
      leadsService,
      realtimeService
    })
    const createPayload = (action: string, emoji: string | null) => ({
      object: 'instagram',
      entry: [
        {
          id: '17841436895629883',
          messaging: [
            {
              sender: { id: '2135646367302892' },
              recipient: { id: '17841436895629883' },
              timestamp: 1786837704174,
              reaction: {
                mid: 'instagram-target-mid',
                action,
                reaction: 'other',
                emoji
              }
            }
          ]
        }
      ]
    })

    await expect(
      service.handleDirectWebhook(createPayload('react', '❤'))
    ).resolves.toEqual({ status: 'received' })
    expect(targetMessage.metadata).toEqual({
      reaction: {
        emoji: '❤️',
        externalUserId: '2135646367302892',
        reactedAt: new Date(1786837704174).toISOString()
      }
    })

    await expect(
      service.handleDirectWebhook(createPayload('unreact', null))
    ).resolves.toEqual({ status: 'received' })
    expect(targetMessage.metadata).toBeNull()
    expect(messageRepo.create).not.toHaveBeenCalled()
    expect(realtimeService.emitToLead).toHaveBeenCalledTimes(2)
    expect(realtimeService.emitToLead).toHaveBeenLastCalledWith(
      'lead-1',
      'message.updated',
      targetMessage
    )
  })

  it('runs Messenger onboarding, populates the lead and ignores a repeated message', async () => {
    type MessengerIdentityParams = {
      channel: LeadChannel
      externalAccountId: string
      externalUserId: string
      profileName: string | null
      profilePictureUrl: string | null
      leadDraft: {
        companyId?: string
        name?: string
        source?: string
        flowState?: LeadFlowState
        state?: LeadState
        runtimeMode?: LeadRuntimeMode
        lastInboundMessageId?: string
        lastActivityAt?: Date
      }
    }

    let firstIdentityCall: MessengerIdentityParams | undefined
    let lead: Lead | undefined
    let identityCreated = false
    const savedMessages: Message[] = []
    const messageRepo = {
      findOne: jest.fn(
        (params: {
          where: {
            channel: MessageChannel
            externalMessageId: string
          }
        }) =>
          Promise.resolve(
            savedMessages.find(
              (message) =>
                message.channel === params.where.channel &&
                message.externalMessageId === params.where.externalMessageId
            ) ?? null
          )
      ),
      create: jest.fn((message: Partial<Message>) => message as Message),
      save: jest.fn((message: Message) => {
        const savedMessage = {
          ...message,
          id: message.id || `message-${savedMessages.length + 1}`,
          createdAt: message.createdAt || new Date('2026-08-12T12:00:00.000Z'),
          updatedAt: message.updatedAt || new Date('2026-08-12T12:00:00.000Z')
        }
        savedMessages.push(savedMessage)
        return Promise.resolve(savedMessage)
      })
    }
    const leadRepo = {
      findOneOrFail: jest.fn(() => Promise.resolve(lead as Lead)),
      save: jest.fn((leadToSave: Lead) => Promise.resolve(leadToSave))
    }
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'company-1',
        messengerPageId: 'page-1',
        messengerToken: ' page-token '
      })
    }
    const leadChannelIdentityService = {
      findIdentity: jest.fn(() =>
        Promise.resolve(identityCreated ? { id: 'identity-1', lead } : null)
      ),
      findOrCreateLeadForIdentity: jest.fn(
        (params: MessengerIdentityParams) => {
          firstIdentityCall ??= params
          const leadCreated = !identityCreated

          if (!lead) {
            lead = {
              id: 'lead-1',
              ...params.leadDraft,
              createdAt: new Date('2026-08-12T12:00:00.000Z'),
              updatedAt: new Date('2026-08-12T12:00:00.000Z')
            } as Lead
          }
          identityCreated = true

          return Promise.resolve({
            lead,
            identity: { id: 'identity-1' },
            leadCreated
          })
        }
      )
    }
    const messengerMessagingService = {
      getMessengerUserInfo: jest.fn().mockResolvedValue({
        data: {
          first_name: 'Lucas',
          last_name: 'Gonçalves',
          profile_pic: 'https://example.com/profile.jpg',
          id: 'psid-1'
        }
      }),
      sendMessengerMessage: jest
        .fn()
        .mockResolvedValueOnce({ data: { message_id: 'messenger-auto-1' } })
        .mockResolvedValueOnce({ data: { message_id: 'messenger-auto-2' } })
        .mockResolvedValueOnce({ data: { message_id: 'messenger-auto-3' } })
    }
    const rabbitPublisherService = {
      publish: jest
        .fn<Promise<void>, [string, Record<string, unknown>]>()
        .mockResolvedValue(undefined)
    }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const storageService = {
      uploadFile: jest.fn().mockResolvedValue({
        url: 'https://storage.example.com/leads/lead-1/messages/messenger-audio-1.mp4'
      })
    }
    const conversationContextBuilder = {
      build: jest.fn(({ lead: contextLead }: { lead: Lead }) =>
        Promise.resolve({ lead: contextLead, recentMessages: savedMessages })
      )
    }
    const service = createService({
      leadRepo,
      messageRepo,
      companyRepo,
      conversationContextBuilder,
      leadFlowEngine: new LeadFlowEngine(),
      leadFlowActionExecutor: new LeadFlowActionExecutor(),
      rabbitPublisherService,
      storageService,
      leadsService,
      leadChannelIdentityService,
      messengerMessagingService,
      realtimeService
    })
    const createPayload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1786492800000,
              message: { mid: 'messenger-inbound-1', text: 'Olá' }
            }
          ]
        }
      ]
    }
    const locationPayload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1786492860000,
              message: {
                mid: 'messenger-inbound-2',
                text: 'Florianópolis'
              }
            }
          ]
        }
      ]
    }
    const contextPayload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1786492920000,
              message: {
                mid: 'messenger-inbound-3',
                text: 'Quero conhecer os serviços'
              }
            }
          ]
        }
      ]
    }

    await service.handleMessengerWebhook(createPayload)
    await service.handleMessengerWebhook(locationPayload)
    await service.handleMessengerWebhook(contextPayload)
    await service.handleMessengerWebhook(contextPayload)
    jest.spyOn(axios, 'get').mockResolvedValueOnce({
      data: Buffer.from('messenger-audio'),
      headers: { 'content-type': 'audio/mp4' }
    })
    await service.handleMessengerWebhook({
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1786492980000,
              message: {
                mid: 'messenger-audio-1',
                attachments: [
                  {
                    type: 'audio',
                    payload: { url: 'https://cdn.example.com/audio.mp4' }
                  }
                ]
              }
            }
          ]
        }
      ]
    })

    expect(
      messengerMessagingService.getMessengerUserInfo
    ).toHaveBeenCalledTimes(1)
    expect(firstIdentityCall).toMatchObject({
      channel: LeadChannel.MESSENGER,
      externalAccountId: 'page-1',
      externalUserId: 'psid-1',
      profileName: 'Lucas Gonçalves',
      profilePictureUrl: 'https://example.com/profile.jpg',
      leadDraft: {
        companyId: 'company-1',
        name: 'Lucas Gonçalves',
        source: LeadChannel.MESSENGER,
        flowState: LeadFlowState.ASKING_LOCATION
      }
    })
    expect(firstIdentityCall?.leadDraft).not.toHaveProperty(
      'userInformationsId'
    )
    expect(companyRepo.findOne).toHaveBeenCalledWith({
      where: { messengerPageId: 'page-1' }
    })
    for (const [event, data] of rabbitPublisherService.publish.mock.calls) {
      expect(['lead.created', 'message.received']).toContain(event)
      expect(data.companyId).toBe('company-1')
      expect(data).not.toHaveProperty('userId')
      expect(data).not.toHaveProperty('userInformationsId')
    }
    expect(lead).toMatchObject({
      location: 'Florianópolis',
      flowState: LeadFlowState.IN_CONVERSATION,
      lastInboundMessageId: 'messenger-audio-1'
    })
    expect(
      messengerMessagingService.sendMessengerMessage
    ).toHaveBeenNthCalledWith(
      1,
      'psid-1',
      'Olá! 👋 \nDa onde você fala?',
      'page-1',
      ' page-token '
    )
    expect(
      messengerMessagingService.sendMessengerMessage
    ).toHaveBeenNthCalledWith(
      3,
      'psid-1',
      'Perfeito! Seu atendimento foi iniciado. Em breve alguém falará com você 😊',
      'page-1',
      ' page-token '
    )
    expect(
      messengerMessagingService.sendMessengerMessage
    ).toHaveBeenNthCalledWith(
      2,
      'psid-1',
      'Como podemos te ajudar ?',
      'page-1',
      ' page-token '
    )
    expect(
      savedMessages.filter(
        (message) => message.channel === MessageChannel.MESSENGER
      )
    ).toHaveLength(7)
    expect(
      savedMessages.filter(
        (message) => message.direction === MessageDirection.INBOUND
      )
    ).toHaveLength(4)
    expect(
      leadChannelIdentityService.findOrCreateLeadForIdentity
    ).toHaveBeenCalledTimes(4)
    expect(storageService.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'messenger-audio-1.mp4',
        mimetype: 'audio/mp4'
      }),
      {
        key: 'leads/lead-1/messages/messenger-audio-1.mp4'
      }
    )
    expect(savedMessages).toContainEqual(
      expect.objectContaining({
        channel: MessageChannel.MESSENGER,
        direction: MessageDirection.INBOUND,
        type: MessageType.AUDIO,
        mediaUrl:
          'https://storage.example.com/leads/lead-1/messages/messenger-audio-1.mp4',
        mimeType: 'audio/mp4'
      })
    )
  })

  describe('Messenger Company isolation', () => {
    const payload = {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              message: { mid: 'mid-1', text: 'Hello' }
            }
          ]
        }
      ]
    }
    const setup = () => {
      const company = Object.assign(new Company(), {
        id: 'company-1',
        messengerPageId: 'page-1',
        messengerToken: 'company-token'
      })
      const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
      const userInformationsRepo = { findOne: jest.fn() }
      const messageRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn()
      }
      const leadChannelIdentityService = {
        findIdentity: jest.fn().mockResolvedValue({ id: 'identity-1' }),
        findOrCreateLeadForIdentity: jest.fn().mockResolvedValue({
          identity: { id: 'identity-1' },
          lead: Object.assign(new Lead(), {
            id: 'lead-foreign',
            companyId: 'company-other'
          }),
          leadCreated: false
        })
      }
      const messengerMessagingService = { sendMessengerMessage: jest.fn() }
      const rabbitPublisherService = { publish: jest.fn() }
      const service = createService({
        companyRepo,
        userInformationsRepo,
        messageRepo,
        leadChannelIdentityService,
        messengerMessagingService,
        rabbitPublisherService
      })
      return {
        service,
        company,
        companyRepo,
        userInformationsRepo,
        messageRepo,
        leadChannelIdentityService,
        messengerMessagingService,
        rabbitPublisherService
      }
    }

    it('ignores an unconfigured page without falling back to UserInformations', async () => {
      const dependencies = setup()
      dependencies.companyRepo.findOne.mockResolvedValue(null)
      await expect(
        dependencies.service.handleMessengerWebhook(payload)
      ).resolves.toEqual({ status: 'received' })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
    })

    it('rejects a lead identity from another Company before persisting or replying', async () => {
      const dependencies = setup()
      await dependencies.service.handleMessengerWebhook(payload)
      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { messengerPageId: 'page-1' }
      })
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
      expect(
        dependencies.messengerMessagingService.sendMessengerMessage
      ).not.toHaveBeenCalled()
      expect(dependencies.rabbitPublisherService.publish).not.toHaveBeenCalled()
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
    })

    it('rejects missing Company credentials before creating a lead or message', async () => {
      const dependencies = setup()
      dependencies.company.messengerToken = null
      await expect(
        dependencies.service.handleMessengerWebhook(payload)
      ).rejects.toThrow('Messenger token is not configured for this company')
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
    })

    it('ignores duplicates without repeating Company resolution or responses', async () => {
      const dependencies = setup()
      dependencies.messageRepo.findOne.mockResolvedValue({ id: 'existing' })
      await dependencies.service.handleMessengerWebhook(payload)
      expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
      expect(
        dependencies.messengerMessagingService.sendMessengerMessage
      ).not.toHaveBeenCalled()
    })

    it('ignores page echoes instead of treating outbound messages as new leads', async () => {
      const dependencies = setup()
      await dependencies.service.handleMessengerWebhook({
        entry: [
          {
            id: 'page-1',
            messaging: [
              {
                sender: { id: 'page-1' },
                recipient: { id: 'psid-1' },
                message: { mid: 'echo-1', text: 'Reply', is_echo: true }
              }
            ]
          }
        ]
      })
      expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
      expect(dependencies.messageRepo.findOne).not.toHaveBeenCalled()
    })
  })

  it('runs Instagram Direct onboarding and keeps the conversation flow', async () => {
    type InstagramIdentityParams = {
      channel: LeadChannel
      externalAccountId: string
      externalUserId: string
      profileName: string | null
      profilePictureUrl: string | null
      leadDraft: {
        companyId?: string
        name?: string
        source?: string
        flowState?: LeadFlowState
        state?: LeadState
        runtimeMode?: LeadRuntimeMode
        lastInboundMessageId?: string
        lastActivityAt?: Date
      }
    }

    let firstIdentityCall: InstagramIdentityParams | undefined
    let lead: Lead | undefined
    let identityCreated = false
    const savedMessages: Message[] = []
    const messageRepo = {
      findOne: jest.fn(
        (params: {
          where: {
            channel: MessageChannel
            externalMessageId: string
          }
        }) =>
          Promise.resolve(
            savedMessages.find(
              (message) =>
                message.channel === params.where.channel &&
                message.externalMessageId === params.where.externalMessageId
            ) ?? null
          )
      ),
      create: jest.fn((message: Partial<Message>) => message as Message),
      save: jest.fn((message: Message) => {
        const savedMessage = {
          ...message,
          id: message.id || `instagram-message-${savedMessages.length + 1}`,
          createdAt: message.createdAt || new Date('2026-08-13T12:00:00.000Z'),
          updatedAt: message.updatedAt || new Date('2026-08-13T12:00:00.000Z')
        }
        savedMessages.push(savedMessage)
        return Promise.resolve(savedMessage)
      })
    }
    const leadRepo = {
      findOneOrFail: jest.fn(() => Promise.resolve(lead as Lead)),
      save: jest.fn((leadToSave: Lead) => Promise.resolve(leadToSave))
    }
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'company-1',
        instagramAccountId: '17841436895629883',
        instagramToken: 'instagram-token'
      })
    }
    const userInformationsRepo = { findOne: jest.fn() }
    const leadChannelIdentityService = {
      findIdentity: jest.fn(() =>
        Promise.resolve(identityCreated ? { id: 'identity-1', lead } : null)
      ),
      findOrCreateLeadForIdentity: jest.fn(
        (params: InstagramIdentityParams) => {
          firstIdentityCall ??= params
          const leadCreated = !identityCreated

          if (!lead) {
            lead = {
              id: 'lead-1',
              ...params.leadDraft,
              createdAt: new Date('2026-08-13T12:00:00.000Z'),
              updatedAt: new Date('2026-08-13T12:00:00.000Z')
            } as Lead
          }
          identityCreated = true

          return Promise.resolve({
            lead,
            identity: { id: 'identity-1' },
            leadCreated
          })
        }
      )
    }
    const instagramMessagingService = {
      getInstagramUserProfile: jest.fn().mockResolvedValue({
        id: '2135646367302892',
        name: 'Lucas Gonçalves',
        username: 'lucasg.floripa',
        profile_pic: 'https://example.com/instagram-profile.jpg'
      }),
      sendMessage: jest
        .fn()
        .mockResolvedValueOnce({ message_id: 'instagram-auto-1' })
        .mockResolvedValueOnce({ message_id: 'instagram-auto-2' })
        .mockResolvedValueOnce({ message_id: 'instagram-auto-3' })
    }
    const storageService = {
      uploadFile: jest.fn((_file: unknown, options: { key: string }) =>
        Promise.resolve({
          url: `https://storage.example.com/${options.key}`
        })
      )
    }
    const rabbitPublisherService = {
      publish: jest
        .fn<Promise<void>, [string, Record<string, unknown>]>()
        .mockResolvedValue(undefined)
    }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const conversationContextBuilder = {
      build: jest.fn(({ lead: contextLead }: { lead: Lead }) =>
        Promise.resolve({ lead: contextLead, recentMessages: savedMessages })
      )
    }
    const service = createService({
      leadRepo,
      messageRepo,
      companyRepo,
      userInformationsRepo,
      conversationContextBuilder,
      leadFlowEngine: new LeadFlowEngine(),
      leadFlowActionExecutor: new LeadFlowActionExecutor(),
      rabbitPublisherService,
      storageService,
      leadsService,
      leadChannelIdentityService,
      instagramMessagingService,
      realtimeService
    })
    const createPayload = {
      object: 'instagram',
      entry: [
        {
          id: '17841436895629883',
          messaging: [
            {
              sender: { id: '2135646367302892' },
              recipient: { id: '17841436895629883' },
              timestamp: 1786579200000,
              message: { mid: 'instagram-inbound-1', text: 'Olá' }
            }
          ]
        }
      ]
    }
    const locationPayload = {
      object: 'instagram',
      entry: [
        {
          id: '17841436895629883',
          messaging: [
            {
              sender: { id: '2135646367302892' },
              recipient: { id: '17841436895629883' },
              timestamp: 1786579260000,
              message: {
                mid: 'instagram-inbound-2',
                text: 'Florianópolis'
              }
            }
          ]
        }
      ]
    }
    const contextPayload = {
      object: 'instagram',
      entry: [
        {
          id: '17841436895629883',
          messaging: [
            {
              sender: { id: '2135646367302892' },
              recipient: { id: '17841436895629883' },
              timestamp: 1786579320000,
              message: {
                mid: 'instagram-inbound-3',
                text: 'Quero conhecer os serviços'
              }
            }
          ]
        }
      ]
    }

    await service.handleDirectWebhook(createPayload)
    await service.handleDirectWebhook(locationPayload)
    await service.handleDirectWebhook(contextPayload)
    await service.handleDirectWebhook(contextPayload)
    jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: Buffer.from('direct-audio'),
        headers: { 'content-type': 'audio/mp4' }
      })
      .mockResolvedValueOnce({
        data: Buffer.from('direct-image'),
        headers: { 'content-type': 'image/jpeg' }
      })
      .mockResolvedValueOnce({
        data: Buffer.from('direct-file'),
        headers: { 'content-type': 'application/pdf' }
      })

    for (const attachment of [
      {
        mid: 'instagram-audio-1',
        type: 'audio',
        url: 'https://cdn.example.com/audio.mp4'
      },
      {
        mid: 'instagram-image-1',
        type: 'image',
        url: 'https://cdn.example.com/image.jpg'
      },
      {
        mid: 'instagram-file-1',
        type: 'file',
        url: 'https://cdn.example.com/file.pdf'
      }
    ]) {
      await service.handleDirectWebhook({
        object: 'instagram',
        entry: [
          {
            id: '17841436895629883',
            messaging: [
              {
                sender: { id: '2135646367302892' },
                recipient: { id: '17841436895629883' },
                timestamp: 1786579380000,
                message: {
                  mid: attachment.mid,
                  attachments: [
                    {
                      type: attachment.type,
                      payload: { url: attachment.url }
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    }

    expect(
      instagramMessagingService.getInstagramUserProfile
    ).toHaveBeenCalledTimes(1)
    expect(firstIdentityCall).toMatchObject({
      channel: LeadChannel.INSTAGRAM,
      externalAccountId: '17841436895629883',
      externalUserId: '2135646367302892',
      profileName: 'Lucas Gonçalves',
      profilePictureUrl: 'https://example.com/instagram-profile.jpg',
      leadDraft: {
        companyId: 'company-1',
        name: 'Lucas Gonçalves',
        source: 'direct',
        flowState: LeadFlowState.ASKING_LOCATION
      }
    })
    expect(firstIdentityCall?.leadDraft).not.toHaveProperty(
      'userInformationsId'
    )
    expect(companyRepo.findOne).toHaveBeenCalledWith({
      where: { instagramAccountId: '17841436895629883' }
    })
    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
    for (const [event, data] of rabbitPublisherService.publish.mock.calls) {
      expect(['lead.created', 'message.received']).toContain(event)
      expect(data.companyId).toBe('company-1')
      expect(data).not.toHaveProperty('userId')
      expect(data).not.toHaveProperty('userInformationsId')
    }
    expect(lead).toMatchObject({
      location: 'Florianópolis',
      flowState: LeadFlowState.IN_CONVERSATION,
      lastInboundMessageId: 'instagram-file-1'
    })
    expect(instagramMessagingService.sendMessage).toHaveBeenNthCalledWith(
      1,
      '17841436895629883',
      '2135646367302892',
      'Olá! 👋 \nDa onde você fala?'
    )
    expect(instagramMessagingService.sendMessage).toHaveBeenNthCalledWith(
      2,
      '17841436895629883',
      '2135646367302892',
      'Como podemos te ajudar ?'
    )
    expect(instagramMessagingService.sendMessage).toHaveBeenNthCalledWith(
      3,
      '17841436895629883',
      '2135646367302892',
      'Perfeito! Seu atendimento foi iniciado. Em breve alguém falará com você 😊'
    )
    expect(
      savedMessages.filter(
        (message) => message.channel === MessageChannel.INSTAGRAM
      )
    ).toHaveLength(9)
    expect(
      savedMessages.filter(
        (message) => message.direction === MessageDirection.INBOUND
      )
    ).toHaveLength(6)
    expect(
      leadChannelIdentityService.findOrCreateLeadForIdentity
    ).toHaveBeenCalledTimes(6)
    expect(savedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: MessageChannel.INSTAGRAM,
          type: MessageType.AUDIO,
          mediaUrl:
            'https://storage.example.com/leads/lead-1/messages/instagram-audio-1.mp4',
          mimeType: 'audio/mp4'
        }),
        expect.objectContaining({
          channel: MessageChannel.INSTAGRAM,
          type: MessageType.IMAGE,
          mediaUrl:
            'https://storage.example.com/leads/lead-1/messages/instagram-image-1.jpg',
          mimeType: 'image/jpeg'
        }),
        expect.objectContaining({
          channel: MessageChannel.INSTAGRAM,
          type: MessageType.DOCUMENT,
          mediaUrl:
            'https://storage.example.com/leads/lead-1/messages/instagram-file-1.pdf',
          mimeType: 'application/pdf'
        })
      ])
    )
  })

  describe('Instagram Direct Company ownership', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'instagram-account-1',
          messaging: [
            {
              sender: { id: 'instagram-user-1' },
              message: { mid: 'instagram-message-1', text: 'Hello' }
            }
          ]
        }
      ]
    }
    const createDependencies = () => {
      const company = Object.assign(new Company(), {
        id: 'company-1',
        instagramAccountId: 'instagram-account-1',
        instagramToken: 'company-token'
      })
      const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
      const userInformationsRepo = { findOne: jest.fn() }
      const messageRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn()
      }
      const leadChannelIdentityService = {
        findIdentity: jest.fn().mockResolvedValue(null),
        findOrCreateLeadForIdentity: jest.fn().mockResolvedValue({
          identity: { id: 'identity-1' },
          lead: Object.assign(new Lead(), {
            id: 'lead-1',
            companyId: 'company-1'
          }),
          leadCreated: true
        })
      }
      const messenger = {
        getInstagramUserProfile: jest.fn().mockResolvedValue(null)
      }
      const rabbitPublisherService = { publish: jest.fn() }
      const service = createService({
        companyRepo,
        userInformationsRepo,
        messageRepo,
        leadChannelIdentityService,
        instagramMessagingService: messenger,
        rabbitPublisherService
      })
      return {
        service,
        company,
        companyRepo,
        userInformationsRepo,
        messageRepo,
        leadChannelIdentityService,
        messenger,
        rabbitPublisherService
      }
    }

    it('ignores an unconfigured Instagram Company without falling back to UserInformations', async () => {
      const dependencies = createDependencies()
      dependencies.companyRepo.findOne.mockResolvedValue(null)
      await expect(
        dependencies.service.handleDirectWebhook(payload)
      ).resolves.toEqual({ status: 'received' })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
    })

    it('ignores a Company without an Instagram token before creating a lead', async () => {
      const dependencies = createDependencies()
      dependencies.company.instagramToken = null
      await dependencies.service.handleDirectWebhook(payload)
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).not.toHaveBeenCalled()
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
    })

    it('rejects an identity already linked to another Company', async () => {
      const dependencies = createDependencies()
      dependencies.leadChannelIdentityService.findIdentity.mockResolvedValue({
        id: 'identity-existing'
      })
      dependencies.messenger.getInstagramUserProfile.mockResolvedValue(
        undefined
      )
      dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity.mockResolvedValue(
        {
          identity: { id: 'identity-existing' },
          lead: Object.assign(new Lead(), {
            id: 'foreign-lead',
            companyId: 'company-other'
          }),
          leadCreated: false
        }
      )
      await dependencies.service.handleDirectWebhook(payload)
      expect(
        dependencies.leadChannelIdentityService.findOrCreateLeadForIdentity
      ).toHaveBeenCalled()
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
      expect(dependencies.rabbitPublisherService.publish).not.toHaveBeenCalled()
    })

    it('ignores echo events before resolving a Company', async () => {
      const dependencies = createDependencies()
      await dependencies.service.handleDirectWebhook({
        object: 'instagram',
        entry: [
          {
            id: 'instagram-account-1',
            messaging: [
              {
                sender: { id: 'instagram-account-1' },
                message: { mid: 'echo-1', text: 'Echo', is_echo: true }
              }
            ]
          }
        ]
      })
      expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
      expect(dependencies.messageRepo.findOne).not.toHaveBeenCalled()
    })
  })
})

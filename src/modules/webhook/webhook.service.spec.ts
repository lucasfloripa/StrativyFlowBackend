import axios from 'axios'

import { LeadChannel } from '../leads/entities/lead-channel-identity.entity'
import {
  Lead,
  LeadFlowState,
  LeadRuntimeMode,
  LeadState
} from '../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageType
} from '../leads/entities/message.entity'

import { LeadFlowActionExecutor } from './flow/lead-flow-action.executor'
import { LeadFlowEngine } from './flow/lead-flow.engine'
import { WebhookService } from './webhook.service'

describe('WebhookService', () => {
  const createService = (overrides?: {
    leadRepo?: object
    messageRepo?: object
    userInformationsRepo?: object
    conversationContextBuilder?: object
    leadFlowEngine?: object
    leadFlowActionExecutor?: object
    automationTriggerDispatcher?: object
    rabbitPublisherService?: object
    storageService?: object
    leadsService?: object
    leadChannelIdentityService?: object
    messengerMessagingService?: object
    instagramMessagingService?: object
    realtimeService?: object
  }) =>
    new WebhookService(
      (overrides?.leadRepo ?? {}) as never,
      (overrides?.messageRepo ?? {}) as never,
      (overrides?.userInformationsRepo ?? {}) as never,
      (overrides?.conversationContextBuilder ?? {}) as never,
      (overrides?.leadFlowEngine ?? {}) as never,
      (overrides?.leadFlowActionExecutor ?? {}) as never,
      (overrides?.automationTriggerDispatcher ?? {}) as never,
      (overrides?.rabbitPublisherService ?? {}) as never,
      (overrides?.storageService ?? {}) as never,
      (overrides?.leadsService ?? {}) as never,
      (overrides?.leadChannelIdentityService ?? {}) as never,
      (overrides?.messengerMessagingService ?? {}) as never,
      (overrides?.instagramMessagingService ?? {}) as never,
      (overrides?.realtimeService ?? {}) as never
    )

  it('ignores payloads without a WhatsApp entry', async () => {
    const service = createService()

    await expect(service.handleIncomingMessage({})).resolves.toEqual({
      status: 'ignored_missing_entry'
    })
  })

  it('persists an inbound WhatsApp contact message as contact', async () => {
    const lead = {
      id: 'lead-1',
      name: 'Lucas',
      userInformationsId: 'user-information-1',
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
      leadRepo: { save: jest.fn() },
      messageRepo,
      userInformationsRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-information-1',
          userId: 'flow-user-1',
          phoneNumberId: '1051101894753146',
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
        metadata: expect.objectContaining({ contacts })
      })
    )
    expect(realtimeService.emitToLead).toHaveBeenCalledWith(
      'lead-1',
      'message.created',
      expect.objectContaining({ type: MessageType.CONTACT })
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
    const automationTriggerDispatcher = { dispatch: jest.fn() }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      userInformationsRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'flow-user-1',
          phoneNumberId: 'phone-number-id-1'
        })
      },
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({
          id: 'identity-1',
          leadId: 'lead-1'
        })
      },
      automationTriggerDispatcher,
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
    expect(automationTriggerDispatcher.dispatch).not.toHaveBeenCalled()
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
      userInformationsRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'flow-user-1',
          phoneNumberId: 'phone-number-id-1'
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
    const automationTriggerDispatcher = { dispatch: jest.fn() }
    const leadsService = {
      toResponseMessageDto: jest.fn((message: Message) =>
        Promise.resolve(message)
      )
    }
    const realtimeService = { emitToLead: jest.fn() }
    const service = createService({
      messageRepo,
      leadChannelIdentityService: {
        findIdentity: jest.fn().mockResolvedValue({
          id: 'identity-1',
          leadId: 'lead-1'
        })
      },
      automationTriggerDispatcher,
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
    expect(automationTriggerDispatcher.dispatch).not.toHaveBeenCalled()
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
        userInformationsId?: string
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
    const userInformationsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-user-1',
        userId: 'user-1',
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
      publish: jest.fn().mockResolvedValue(null)
    }
    const automationTriggerDispatcher = {
      dispatch: jest.fn().mockResolvedValue(null)
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
      userInformationsRepo,
      conversationContextBuilder,
      leadFlowEngine: new LeadFlowEngine(),
      leadFlowActionExecutor: new LeadFlowActionExecutor(),
      automationTriggerDispatcher,
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
        userInformationsId: 'flow-user-1',
        name: 'Lucas Gonçalves',
        source: LeadChannel.MESSENGER,
        flowState: LeadFlowState.ASKING_LOCATION
      }
    })
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

  it('runs Instagram Direct onboarding and keeps the conversation flow', async () => {
    type InstagramIdentityParams = {
      channel: LeadChannel
      externalAccountId: string
      externalUserId: string
      profileName: string | null
      profilePictureUrl: string | null
      leadDraft: {
        userInformationsId?: string
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
    const userInformationsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-user-1',
        userId: 'user-1',
        instagramAccountId: '17841436895629883',
        instagramToken: 'instagram-token'
      })
    }
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
      publish: jest.fn().mockResolvedValue(null)
    }
    const automationTriggerDispatcher = {
      dispatch: jest.fn().mockResolvedValue(null)
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
      userInformationsRepo,
      conversationContextBuilder,
      leadFlowEngine: new LeadFlowEngine(),
      leadFlowActionExecutor: new LeadFlowActionExecutor(),
      automationTriggerDispatcher,
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
        userInformationsId: 'flow-user-1',
        name: 'Lucas Gonçalves',
        source: 'direct',
        flowState: LeadFlowState.ASKING_LOCATION
      }
    })
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
})

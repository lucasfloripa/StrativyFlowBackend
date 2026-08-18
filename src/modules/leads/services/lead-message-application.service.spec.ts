import { LeadChannel } from '../entities/lead-channel-identity.entity'
import { Lead } from '../entities/lead.entity'
import {
  MessageChannel,
  MessageSource,
  MessageType
} from '../entities/message.entity'

import { LeadMessageApplicationService } from './lead-message-application.service'

describe('LeadMessageApplicationService', () => {
  const createService = () => {
    const lead = { id: 'lead-1' } as Lead
    const leadMessageContextService = {
      resolveInstagramOutboundContextOrFail: jest.fn().mockResolvedValue({
        lead,
        instagramAccountId: 'instagram-account-1',
        instagramUserId: 'instagram-user-1'
      }),
      resolveMessengerOutboundContextOrFail: jest.fn().mockResolvedValue({
        lead,
        destinationPsid: 'psid-1',
        pageId: 'page-1',
        messengerToken: 'messenger-token'
      }),
      resolveOutboundContextOrFail: jest.fn().mockResolvedValue({
        lead,
        destinationPhone: '5548999999999',
        phoneNumberId: 'phone-number-id',
        whatsappToken: 'whatsapp-token'
      }),
      markLeadActivity: jest.fn().mockResolvedValue(undefined)
    }
    const leadMessageDispatchService = {
      persistAndEmitOutboundMessage: jest
        .fn()
        .mockResolvedValue({ success: true })
    }
    const messengerMessagingService = {
      sendMessengerMessage: jest.fn().mockResolvedValue({
        data: {
          recipient_id: 'psid-1',
          message_id: 'messenger-message-1'
        }
      }),
      sendMessengerAttachment: jest.fn().mockResolvedValue({
        data: {
          recipient_id: 'psid-1',
          message_id: 'messenger-attachment-1'
        }
      })
    }
    const instagramMessagingService = {
      sendMessage: jest.fn().mockResolvedValue({
        recipient_id: 'instagram-user-1',
        message_id: 'instagram-message-1'
      }),
      sendInstagramAttachment: jest.fn().mockResolvedValue({
        recipient_id: 'instagram-user-1',
        message_id: 'instagram-attachment-1'
      })
    }
    const whatsappOutboundService = {
      sendTextMessage: jest.fn().mockResolvedValue({
        data: {
          messages: [{ id: 'whatsapp-message-1' }]
        }
      }),
      uploadMedia: jest.fn(),
      sendMediaMessage: jest.fn()
    }
    const chatMediaPolicyService = {
      assertTextMessageIsSupported: jest.fn(),
      validateOutboundMediaPayload: jest.fn(
        (payload: {
          type: 'audio' | 'image' | 'video' | 'document'
          file?: { originalname: string; mimetype: string; size: number }
        }) => ({
          type: payload.type,
          extension: 'bin',
          originalName: payload.file?.originalname ?? 'attachment.bin',
          mimeType: payload.file?.mimetype ?? 'application/octet-stream',
          size: payload.file?.size ?? 0
        })
      ),
      toMessageType: jest.fn(
        (type: 'audio' | 'image' | 'video' | 'document') => type
      )
    }
    const leadMessageMetadataService = {
      normalizeMetadata: jest.fn().mockReturnValue(null)
    }
    const storageService = {
      uploadFile: jest.fn().mockResolvedValue({
        url: 'https://storage.example.com/attachment.bin'
      }),
      generatePresignedUrl: jest
        .fn()
        .mockResolvedValue(
          'https://r2.example.com/private-bucket/attachment.bin?X-Amz-Signature=signed'
        ),
      deleteFile: jest.fn()
    }
    const audioConverterService = {
      isInstagramSupportedAudio: jest.fn().mockReturnValue(false),
      convertToInstagramM4a: jest.fn().mockResolvedValue({
        buffer: Buffer.from('converted-m4a'),
        mimeType: 'audio/mp4',
        extension: 'm4a'
      })
    }
    const messageTemplateService = {
      findOne: jest.fn()
    }
    const whatsAppTemplateSender = {
      sendTemplate: jest.fn().mockResolvedValue(undefined)
    }
    const contactsService = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'contact-1',
          name: 'João da Silva',
          phone: '5511999999999'
        },
        {
          id: 'contact-2',
          name: 'Maria',
          phone: '+5548999999999'
        }
      ])
    }
    const whatsAppMessagingService = {
      sendWhatsAppContact: jest.fn().mockResolvedValue({
        data: {
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'whatsapp-contact-message-1' }]
        }
      })
    }
    const service = new LeadMessageApplicationService(
      {} as never,
      leadMessageContextService as never,
      leadMessageDispatchService as never,
      leadMessageMetadataService as never,
      storageService as never,
      audioConverterService as never,
      messengerMessagingService as never,
      instagramMessagingService as never,
      whatsappOutboundService as never,
      chatMediaPolicyService as never,
      messageTemplateService as never,
      whatsAppTemplateSender as never,
      contactsService as never,
      whatsAppMessagingService as never
    )

    return {
      service,
      lead,
      leadMessageContextService,
      leadMessageDispatchService,
      messengerMessagingService,
      instagramMessagingService,
      audioConverterService,
      whatsappOutboundService,
      storageService,
      messageTemplateService,
      contactsService,
      whatsAppMessagingService
    }
  }

  it('sends and persists manual Messenger text with the Messenger identity', async () => {
    const dependencies = createService()

    await dependencies.service.sendTextMessage({
      userId: 'user-1',
      leadId: dependencies.lead.id,
      content: ' Olá pelo Messenger ',
      channel: LeadChannel.MESSENGER
    })

    expect(
      dependencies.messengerMessagingService.sendMessengerMessage
    ).toHaveBeenCalledWith(
      'psid-1',
      'Olá pelo Messenger',
      'page-1',
      'messenger-token'
    )
    expect(
      dependencies.whatsappOutboundService.sendTextMessage
    ).not.toHaveBeenCalled()
    expect(
      dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
    ).toHaveBeenCalledWith({
      leadId: 'lead-1',
      content: 'Olá pelo Messenger',
      type: MessageType.TEXT,
      source: undefined,
      channel: MessageChannel.MESSENGER,
      externalMessageId: 'messenger-message-1',
      metadata: {
        messengerResponse: {
          recipient_id: 'psid-1',
          message_id: 'messenger-message-1'
        }
      }
    })
  })

  it('keeps WhatsApp as the default manual text channel', async () => {
    const dependencies = createService()

    await dependencies.service.sendTextMessage({
      userId: 'user-1',
      leadId: dependencies.lead.id,
      content: 'Olá pelo WhatsApp'
    })

    expect(
      dependencies.whatsappOutboundService.sendTextMessage
    ).toHaveBeenCalledWith(
      '5548999999999',
      'Olá pelo WhatsApp',
      'phone-number-id',
      'whatsapp-token'
    )
    expect(
      dependencies.messengerMessagingService.sendMessengerMessage
    ).not.toHaveBeenCalled()
  })

  it('sends and persists multiple owned WhatsApp contacts', async () => {
    const dependencies = createService()

    await dependencies.service.sendContactMessage({
      userId: 'user-1',
      leadId: dependencies.lead.id,
      contactIds: ['contact-1', 'contact-2']
    })

    expect(dependencies.contactsService.findMany).toHaveBeenCalledWith(
      'user-1',
      ['contact-1', 'contact-2']
    )
    expect(
      dependencies.whatsAppMessagingService.sendWhatsAppContact
    ).toHaveBeenCalledWith(
      '5548999999999',
      [
        {
          name: {
            formatted_name: 'João da Silva',
            first_name: 'João',
            last_name: 'da Silva'
          },
          phones: [{ phone: '+5511999999999', type: 'CELL' }]
        },
        {
          name: {
            formatted_name: 'Maria',
            first_name: 'Maria'
          },
          phones: [{ phone: '+5548999999999', type: 'CELL' }]
        }
      ],
      'phone-number-id',
      'whatsapp-token'
    )
    expect(
      dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        content: 'João da Silva, Maria',
        type: MessageType.CONTACT,
        whatsappMessageId: 'whatsapp-contact-message-1'
      })
    )
  })

  it('sends and persists manual Instagram text with the Instagram identity', async () => {
    const dependencies = createService()

    await dependencies.service.sendTextMessage({
      userId: 'user-1',
      leadId: dependencies.lead.id,
      content: ' Olá pelo Direct ',
      channel: LeadChannel.INSTAGRAM
    })

    expect(
      dependencies.instagramMessagingService.sendMessage
    ).toHaveBeenCalledWith(
      'instagram-account-1',
      'instagram-user-1',
      'Olá pelo Direct'
    )
    expect(
      dependencies.whatsappOutboundService.sendTextMessage
    ).not.toHaveBeenCalled()
    expect(
      dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
    ).toHaveBeenCalledWith({
      leadId: 'lead-1',
      content: 'Olá pelo Direct',
      type: MessageType.TEXT,
      source: undefined,
      channel: MessageChannel.INSTAGRAM,
      externalMessageId: 'instagram-message-1',
      metadata: {
        instagramResponse: {
          recipient_id: 'instagram-user-1',
          message_id: 'instagram-message-1'
        }
      }
    })
  })

  it.each([
    ['image', 'image', MessageType.IMAGE],
    ['document', 'file', MessageType.DOCUMENT],
    ['audio', 'audio', MessageType.AUDIO]
  ] as const)(
    'sends %s through Messenger attachments as %s',
    async (mediaType, messengerAttachmentType, messageType) => {
      const dependencies = createService()
      const file = {
        buffer: Buffer.from('attachment'),
        originalname: `attachment.${mediaType}`,
        mimetype: `application/${mediaType}`,
        size: 10
      }

      await dependencies.service.sendMediaMessage({
        userId: 'user-1',
        leadId: dependencies.lead.id,
        type: mediaType,
        file,
        channel: LeadChannel.MESSENGER
      })

      expect(
        dependencies.messengerMessagingService.sendMessengerAttachment
      ).toHaveBeenCalledWith(
        'psid-1',
        messengerAttachmentType,
        'https://r2.example.com/private-bucket/attachment.bin?X-Amz-Signature=signed',
        'page-1',
        'messenger-token'
      )
      expect(
        dependencies.storageService.generatePresignedUrl
      ).toHaveBeenCalledWith(
        expect.stringMatching(/^leads\/lead-1\/messages\/[0-9a-f-]+\.bin$/),
        600,
        mediaType === 'document' ? 'attachment.document' : undefined
      )
      expect(
        dependencies.whatsappOutboundService.uploadMedia
      ).not.toHaveBeenCalled()
      expect(
        dependencies.whatsappOutboundService.sendMediaMessage
      ).not.toHaveBeenCalled()
      expect(
        dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-1',
          type: messageType,
          channel: MessageChannel.MESSENGER,
          externalMessageId: 'messenger-attachment-1',
          mediaUrl: 'https://storage.example.com/attachment.bin'
        })
      )
      expect(dependencies.storageService.deleteFile).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['image', 'image', MessageType.IMAGE],
    ['document', 'file', MessageType.DOCUMENT],
    ['audio', 'audio', MessageType.AUDIO]
  ] as const)(
    'sends %s through Instagram attachments as %s',
    async (mediaType, instagramAttachmentType, messageType) => {
      const dependencies = createService()
      const file = {
        buffer: Buffer.from('attachment'),
        originalname: `attachment.${mediaType}`,
        mimetype: `application/${mediaType}`,
        size: 10
      }

      await dependencies.service.sendMediaMessage({
        userId: 'user-1',
        leadId: dependencies.lead.id,
        type: mediaType,
        file,
        channel: LeadChannel.INSTAGRAM
      })

      expect(
        dependencies.instagramMessagingService.sendInstagramAttachment
      ).toHaveBeenCalledWith(
        'instagram-account-1',
        'instagram-user-1',
        instagramAttachmentType,
        'https://r2.example.com/private-bucket/attachment.bin?X-Amz-Signature=signed'
      )
      expect(
        dependencies.storageService.generatePresignedUrl
      ).toHaveBeenCalledWith(
        expect.stringMatching(
          mediaType === 'audio'
            ? /^leads\/lead-1\/messages\/[0-9a-f-]+\.m4a$/
            : /^leads\/lead-1\/messages\/[0-9a-f-]+\.bin$/
        ),
        600,
        mediaType === 'document' ? 'attachment.document' : undefined
      )
      expect(
        dependencies.whatsappOutboundService.uploadMedia
      ).not.toHaveBeenCalled()
      expect(
        dependencies.whatsappOutboundService.sendMediaMessage
      ).not.toHaveBeenCalled()
      expect(
        dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-1',
          type: messageType,
          channel: MessageChannel.INSTAGRAM,
          externalMessageId: 'instagram-attachment-1',
          mediaUrl: 'https://storage.example.com/attachment.bin'
        })
      )
      expect(dependencies.storageService.deleteFile).not.toHaveBeenCalled()
      if (mediaType === 'audio') {
        expect(
          dependencies.audioConverterService.convertToInstagramM4a
        ).toHaveBeenCalledWith(file.buffer)
      }
    }
  )

  it.each([
    ['UTILITY', 'UTILITY'],
    [null, 'UNKNOWN']
  ] as const)(
    'persists template type %s as %s',
    async (category, expectedTemplateType) => {
      const dependencies = createService()
      dependencies.messageTemplateService.findOne.mockResolvedValue({
        id: 'template-1',
        name: 'Confirmacao',
        metaTemplateName: 'confirmacao',
        language: 'pt_BR',
        category,
        description: 'Olá, {{name}}',
        variables: [{ key: 'name', label: 'Nome', required: true }]
      })

      await dependencies.service.sendTemplateMessage({
        userId: 'user-1',
        leadId: dependencies.lead.id,
        templateId: 'template-1',
        variables: { name: 'Lucas' }
      })

      expect(
        dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
      ).toHaveBeenCalledWith({
        leadId: 'lead-1',
        content: 'Olá, Lucas',
        type: MessageType.TEXT,
        source: MessageSource.TEMPLATE,
        templateType: expectedTemplateType,
        metadata: {
          templateId: 'template-1',
          templateName: 'Confirmacao',
          templateType: expectedTemplateType,
          templateVariables: { name: 'Lucas' }
        }
      })
    }
  )
})

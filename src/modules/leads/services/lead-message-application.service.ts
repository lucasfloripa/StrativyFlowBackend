import { randomUUID } from 'crypto'

import { BadRequestException, Injectable, Logger } from '@nestjs/common'

import { ContactsService } from '../../contacts/contacts.service'
import { MessageTemplateService } from '../../followup/services/message-template.service'
import { WhatsAppTemplateSender } from '../../followup/services/whatsapp-template-sender.service'
import { StorageService } from '../../storage/storage.service'
import {
  InstagramAttachmentType,
  InstagramMessagingService
} from '../../webhook/instagram-messaging.service'
import {
  MessengerAttachmentType,
  MessengerMessagingService
} from '../../webhook/messenger-messaging.service'
import {
  WhatsAppContact,
  WhatsAppMessagingService
} from '../../webhook/whatsapp-messaging.service'
import { LeadChannel } from '../entities/lead-channel-identity.entity'
import {
  MessageChannel,
  MessageSource,
  MessageType
} from '../entities/message.entity'
import { LeadsService } from '../leads.service'

import { AudioConverterService } from './audio-converter.service'
import { ChatMediaPolicyService } from './chat-media-policy.service'
import { SendContactLeadMessageCommand } from './commands/send-contact-lead-message.command'
import { SendMediaLeadMessageCommand } from './commands/send-media-lead-message.command'
import { SendTemplateLeadMessageCommand } from './commands/send-template-lead-message.command'
import { SendTextLeadMessageCommand } from './commands/send-text-lead-message.command'
import { LeadMessageContextService } from './lead-message-context.service'
import { LeadMessageDispatchService } from './lead-message-dispatch.service'
import { LeadMessageMetadataService } from './lead-message-metadata.service'
import { OutboundMediaType } from './types/outbound-media.type'
import { WhatsAppOutboundService } from './whatsapp-outbound.service'

const messengerAttachmentTypeByMediaType: Record<
  OutboundMediaType,
  MessengerAttachmentType
> = {
  audio: 'audio',
  image: 'image',
  video: 'video',
  document: 'file'
}

const instagramAttachmentTypeByMediaType: Record<
  OutboundMediaType,
  InstagramAttachmentType
> = {
  audio: 'audio',
  image: 'image',
  video: 'video',
  document: 'file'
}

@Injectable()
export class LeadMessageApplicationService {
  private readonly logger = new Logger(LeadMessageApplicationService.name)

  constructor(
    private readonly leadsService: LeadsService,
    private readonly leadMessageContextService: LeadMessageContextService,
    private readonly leadMessageDispatchService: LeadMessageDispatchService,
    private readonly leadMessageMetadataService: LeadMessageMetadataService,
    private readonly storageService: StorageService,
    private readonly audioConverterService: AudioConverterService,
    private readonly messengerMessagingService: MessengerMessagingService,
    private readonly instagramMessagingService: InstagramMessagingService,
    private readonly whatsappOutboundService: WhatsAppOutboundService,
    private readonly chatMediaPolicyService: ChatMediaPolicyService,
    private readonly messageTemplateService: MessageTemplateService,
    private readonly whatsAppTemplateSender: WhatsAppTemplateSender,
    private readonly contactsService: ContactsService,
    private readonly whatsAppMessagingService: WhatsAppMessagingService
  ) {}

  async getLeadMessages(params: { userId: string; leadId: string }) {
    const { userId, leadId } = params
    return this.leadsService.getLeadMessages(userId, leadId)
  }

  async sendTextMessage(command: SendTextLeadMessageCommand) {
    this.chatMediaPolicyService.assertTextMessageIsSupported()

    const content = command.content?.trim()

    if (!content) {
      throw new BadRequestException('Message content is required')
    }

    if (command.channel === LeadChannel.MESSENGER) {
      const { lead, destinationPsid, pageId, messengerToken } =
        await this.leadMessageContextService.resolveMessengerOutboundContextOrFail(
          command.userId,
          command.leadId
        )
      const response =
        await this.messengerMessagingService.sendMessengerMessage(
          destinationPsid,
          content,
          pageId,
          messengerToken
        )

      await this.leadMessageContextService.markLeadActivity(lead)

      return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
        leadId: lead.id,
        content,
        type: MessageType.TEXT,
        source: command.source,
        channel: MessageChannel.MESSENGER,
        externalMessageId: response.data.message_id ?? null,
        metadata: {
          messengerResponse: response.data
        }
      })
    }

    if (command.channel === LeadChannel.INSTAGRAM) {
      const { lead, instagramAccountId, instagramUserId } =
        await this.leadMessageContextService.resolveInstagramOutboundContextOrFail(
          command.userId,
          command.leadId
        )
      const response = await this.instagramMessagingService.sendMessage(
        instagramAccountId,
        instagramUserId,
        content
      )

      await this.leadMessageContextService.markLeadActivity(lead)

      return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
        leadId: lead.id,
        content,
        type: MessageType.TEXT,
        source: command.source,
        channel: MessageChannel.INSTAGRAM,
        externalMessageId: response.message_id,
        metadata: {
          instagramResponse: response
        }
      })
    }

    const { lead, destinationPhone, phoneNumberId, whatsappToken } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )

    const response = await this.whatsappOutboundService.sendTextMessage(
      destinationPhone,
      content,
      phoneNumberId,
      whatsappToken
    )

    await this.leadMessageContextService.markLeadActivity(lead)

    return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
      leadId: lead.id,
      content,
      type: MessageType.TEXT,
      source: command.source,
      whatsappMessageId: response.data.messages[0]?.id ?? null,
      metadata: {
        whatsappResponse: response.data
      }
    })
  }

  async sendContactMessage(command: SendContactLeadMessageCommand) {
    const { lead, destinationPhone, phoneNumberId, whatsappToken } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )
    const contacts = await this.contactsService.findMany(
      command.userId,
      command.contactIds
    )
    const whatsappContacts: WhatsAppContact[] = contacts.map((contact) => {
      const [firstName, ...remainingNames] = contact.name.trim().split(/\s+/)
      const lastName = remainingNames.join(' ')
      const phoneDigits = contact.phone.replace(/\D/g, '')

      return {
        name: {
          formatted_name: contact.name,
          first_name: firstName,
          ...(lastName ? { last_name: lastName } : {})
        },
        phones: [{ phone: `+${phoneDigits}`, type: 'CELL' }]
      }
    })
    const response = await this.whatsAppMessagingService.sendWhatsAppContact(
      destinationPhone,
      whatsappContacts,
      phoneNumberId,
      whatsappToken
    )

    await this.leadMessageContextService.markLeadActivity(lead)

    return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
      leadId: lead.id,
      content: contacts.map((contact) => contact.name).join(', '),
      type: MessageType.CONTACT,
      whatsappMessageId: response.data.messages[0]?.id ?? null,
      metadata: {
        contacts: whatsappContacts,
        whatsappResponse: response.data
      }
    })
  }

  async sendMediaMessage(command: SendMediaLeadMessageCommand) {
    let validatedMedia =
      this.chatMediaPolicyService.validateOutboundMediaPayload({
        type: command.type,
        file: command.file
      })

    let file = command.file
    if (!file) {
      throw new BadRequestException('Arquivo nao enviado.')
    }

    const outboundContext =
      command.channel === LeadChannel.INSTAGRAM
        ? await this.leadMessageContextService.resolveInstagramOutboundContextOrFail(
            command.userId,
            command.leadId
          )
        : command.channel === LeadChannel.MESSENGER
          ? await this.leadMessageContextService.resolveMessengerOutboundContextOrFail(
              command.userId,
              command.leadId
            )
          : await this.leadMessageContextService.resolveOutboundContextOrFail(
              command.userId,
              command.leadId
            )
    const { lead } = outboundContext

    if (
      command.channel === LeadChannel.INSTAGRAM &&
      validatedMedia.type === 'audio' &&
      !this.audioConverterService.isInstagramSupportedAudio(file.mimetype)
    ) {
      const convertedAudio =
        await this.audioConverterService.convertToInstagramM4a(file.buffer)
      const convertedFileName = file.originalname.replace(/\.[^.]+$/, '')

      file = {
        ...file,
        buffer: convertedAudio.buffer,
        mimetype: convertedAudio.mimeType,
        originalname: `${convertedFileName}.${convertedAudio.extension}`,
        size: convertedAudio.buffer.length
      }
      validatedMedia = {
        ...validatedMedia,
        mimeType: convertedAudio.mimeType,
        extension: convertedAudio.extension,
        originalName: file.originalname,
        size: convertedAudio.buffer.length
      }
    }

    this.logger.debug('Outbound media file received.', {
      fileOriginalName: file.originalname,
      fileMimeType: file.mimetype,
      fileSize: file.size,
      requestedType: command.type
    })

    const normalizedRequestMetadata =
      this.leadMessageMetadataService.normalizeMetadata(command.metadata)

    const storageKey = `leads/${lead.id}/messages/${randomUUID()}.${validatedMedia.extension}`
    const uploadResult = await this.storageService.uploadFile(file, {
      key: storageKey
    })

    try {
      if ('instagramUserId' in outboundContext) {
        const presignedUrl = await this.storageService.generatePresignedUrl(
          storageKey,
          600,
          validatedMedia.type === 'document'
            ? validatedMedia.originalName
            : undefined
        )
        const instagramResponse =
          await this.instagramMessagingService.sendInstagramAttachment(
            outboundContext.instagramAccountId,
            outboundContext.instagramUserId,
            instagramAttachmentTypeByMediaType[validatedMedia.type],
            presignedUrl
          )

        await this.leadMessageContextService.markLeadActivity(lead)

        const normalizedCaption = command.caption?.trim() || null
        const mergedMetadata = {
          ...(normalizedRequestMetadata
            ? { requestMetadata: normalizedRequestMetadata }
            : {}),
          storage: {
            key: storageKey
          },
          instagramResponse
        }

        return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
          leadId: lead.id,
          content: normalizedCaption,
          type: this.chatMediaPolicyService.toMessageType(validatedMedia.type),
          source: command.source,
          channel: MessageChannel.INSTAGRAM,
          externalMessageId: instagramResponse.message_id,
          mediaUrl: uploadResult.url,
          mimeType: validatedMedia.mimeType,
          mediaSize: validatedMedia.size,
          fileName: validatedMedia.originalName,
          metadata: mergedMetadata
        })
      }

      if ('destinationPsid' in outboundContext) {
        const presignedUrl = await this.storageService.generatePresignedUrl(
          storageKey,
          600,
          validatedMedia.type === 'document'
            ? validatedMedia.originalName
            : undefined
        )
        const messengerResponse =
          await this.messengerMessagingService.sendMessengerAttachment(
            outboundContext.destinationPsid,
            messengerAttachmentTypeByMediaType[validatedMedia.type],
            presignedUrl,
            outboundContext.pageId,
            outboundContext.messengerToken
          )

        await this.leadMessageContextService.markLeadActivity(lead)

        const normalizedCaption = command.caption?.trim() || null
        const mergedMetadata = {
          ...(normalizedRequestMetadata
            ? { requestMetadata: normalizedRequestMetadata }
            : {}),
          storage: {
            key: storageKey
          },
          messengerResponse: messengerResponse.data
        }

        return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
          leadId: lead.id,
          content: normalizedCaption,
          type: this.chatMediaPolicyService.toMessageType(validatedMedia.type),
          source: command.source,
          channel: MessageChannel.MESSENGER,
          externalMessageId: messengerResponse.data.message_id ?? null,
          mediaUrl: uploadResult.url,
          mimeType: validatedMedia.mimeType,
          mediaSize: validatedMedia.size,
          fileName: validatedMedia.originalName,
          metadata: mergedMetadata
        })
      }

      const { destinationPhone, phoneNumberId, whatsappToken } = outboundContext
      const uploadedMedia = await this.whatsappOutboundService.uploadMedia(
        file,
        phoneNumberId,
        whatsappToken
      )

      const outboundResponse =
        await this.whatsappOutboundService.sendMediaMessage({
          to: destinationPhone,
          phoneNumberId,
          type: validatedMedia.type,
          mediaId: uploadedMedia.data.id,
          caption: command.caption,
          fileName: validatedMedia.originalName,
          whatsappToken
        })

      await this.leadMessageContextService.markLeadActivity(lead)

      const normalizedCaption = command.caption?.trim() || null
      const mergedMetadata =
        this.leadMessageMetadataService.buildOutboundMediaMetadata({
          requestMetadata: normalizedRequestMetadata,
          whatsappResponse: outboundResponse.data,
          storageKey,
          uploadedMediaId: uploadedMedia.data.id
        })

      return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
        leadId: lead.id,
        content: normalizedCaption,
        type: this.chatMediaPolicyService.toMessageType(validatedMedia.type),
        source: command.source,
        mediaUrl: uploadResult.url,
        metaMediaId: uploadedMedia.data.id,
        mimeType: validatedMedia.mimeType,
        mediaSize: validatedMedia.size,
        fileName: validatedMedia.originalName,
        whatsappMessageId: outboundResponse.data.messages[0]?.id ?? null,
        metadata: mergedMetadata
      })
    } catch (error) {
      try {
        await this.storageService.deleteFile(storageKey)
      } catch {
        // Best-effort cleanup for orphaned uploads when outbound dispatch fails.
      }

      throw error
    }
  }

  async sendTemplateMessage(command: SendTemplateLeadMessageCommand) {
    const { lead, destinationPhone, phoneNumberId, whatsappToken } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )

    if (!whatsappToken?.trim()) {
      throw new BadRequestException(
        'WhatsApp token is not configured for this lead'
      )
    }

    const template = await this.messageTemplateService.findOne(
      command.templateId
    )

    if (!template) {
      throw new BadRequestException('Template não encontrado')
    }

    const sendTemplateCommand = {
      followUpId: randomUUID(),
      negotiationId: lead.id,
      leadId: lead.id,
      templateId: command.templateId,
      phone: destinationPhone,
      phoneNumberId,
      accessToken: whatsappToken,
      metaTemplateName: template.metaTemplateName,
      language: template.language ?? 'pt_BR',
      templateVariableDefinitions: template.variables ?? [],
      variables: command.variables
    }

    await this.whatsAppTemplateSender.sendTemplate(sendTemplateCommand)

    await this.leadMessageContextService.markLeadActivity(lead)

    // Compile template content by replacing variables with their values
    let compiledContent = template.description ?? ''
    if (template.variables && template.variables.length > 0) {
      template.variables.forEach((variable) => {
        const value = command.variables[variable.key] ?? ''
        compiledContent = compiledContent.replace(`{{${variable.key}}}`, value)
      })
    }

    const templateType = template.category?.trim() || 'UNKNOWN'

    // Also persist a text message with template source to track it in the chat
    return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
      leadId: lead.id,
      content: compiledContent,
      type: MessageType.TEXT,
      source: MessageSource.TEMPLATE,
      templateType,
      metadata: {
        templateId: command.templateId,
        templateName: template.name,
        templateType,
        templateVariables: command.variables
      }
    })
  }
}

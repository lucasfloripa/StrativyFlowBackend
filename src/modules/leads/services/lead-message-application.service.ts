import { randomUUID } from 'crypto'

import { BadRequestException, Injectable, Logger } from '@nestjs/common'

import { MessageTemplateService } from '../../followup/services/message-template.service'
import { WhatsAppTemplateSender } from '../../followup/services/whatsapp-template-sender.service'
import { StorageService } from '../../storage/storage.service'
import { MessageType } from '../entities/message.entity'
import { LeadsService } from '../leads.service'

import { ChatMediaPolicyService } from './chat-media-policy.service'
import { SendMediaLeadMessageCommand } from './commands/send-media-lead-message.command'
import { SendTemplateLeadMessageCommand } from './commands/send-template-lead-message.command'
import { SendTextLeadMessageCommand } from './commands/send-text-lead-message.command'
import { LeadMessageContextService } from './lead-message-context.service'
import { LeadMessageDispatchService } from './lead-message-dispatch.service'
import { LeadMessageMetadataService } from './lead-message-metadata.service'
import { WhatsAppOutboundService } from './whatsapp-outbound.service'

@Injectable()
export class LeadMessageApplicationService {
  private readonly logger = new Logger(LeadMessageApplicationService.name)

  constructor(
    private readonly leadsService: LeadsService,
    private readonly leadMessageContextService: LeadMessageContextService,
    private readonly leadMessageDispatchService: LeadMessageDispatchService,
    private readonly leadMessageMetadataService: LeadMessageMetadataService,
    private readonly storageService: StorageService,
    private readonly whatsappOutboundService: WhatsAppOutboundService,
    private readonly chatMediaPolicyService: ChatMediaPolicyService,
    private readonly messageTemplateService: MessageTemplateService,
    private readonly whatsAppTemplateSender: WhatsAppTemplateSender
  ) {}

  async getLeadMessages(params: { userId: string; leadId: string }) {
    const { userId, leadId } = params
    return this.leadsService.getLeadMessages(userId, leadId)
  }

  async sendTextMessage(command: SendTextLeadMessageCommand) {
    this.chatMediaPolicyService.assertTextMessageIsSupported()

    const { lead, destinationPhone, phoneNumberId } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )

    const content = command.content?.trim()

    if (!content) {
      throw new BadRequestException('Message content is required')
    }

    const response = await this.whatsappOutboundService.sendTextMessage(
      destinationPhone,
      content,
      phoneNumberId
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

  async sendMediaMessage(command: SendMediaLeadMessageCommand) {
    const { lead, destinationPhone, phoneNumberId } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )

    const validatedMedia =
      this.chatMediaPolicyService.validateOutboundMediaPayload({
        type: command.type,
        file: command.file
      })

    const file = command.file
    if (!file) {
      throw new BadRequestException('Arquivo nao enviado.')
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
      const uploadedMedia = await this.whatsappOutboundService.uploadMedia(
        file,
        phoneNumberId
      )

      const outboundResponse =
        await this.whatsappOutboundService.sendMediaMessage({
          to: destinationPhone,
          phoneNumberId,
          type: validatedMedia.type,
          mediaId: uploadedMedia.data.id,
          caption: command.caption,
          fileName: validatedMedia.originalName
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
    const { lead, destinationPhone } =
      await this.leadMessageContextService.resolveOutboundContextOrFail(
        command.userId,
        command.leadId
      )

    const template = await this.messageTemplateService.findOne(command.templateId)

    if (!template) {
      throw new BadRequestException('Template não encontrado')
    }

    const sendTemplateCommand = {
      followUpId: randomUUID(),
      negotiationId: lead.id,
      leadId: lead.id,
      templateId: command.templateId,
      phone: destinationPhone,
      metaTemplateName: template.metaTemplateName,
      language: template.language ?? 'pt_BR',
      templateVariableDefinitions: template.variables ?? [],
      variables: command.variables
    }

    await this.whatsAppTemplateSender.sendTemplate(sendTemplateCommand)

    await this.leadMessageContextService.markLeadActivity(lead)

    // Also persist a text message with template source to track it in the chat
    return this.leadMessageDispatchService.persistAndEmitOutboundMessage({
      leadId: lead.id,
      content: template.description ?? null,
      type: MessageType.TEXT,
      source: 'template' as any,
      metadata: {
        templateId: command.templateId,
        templateName: template.name,
        templateVariables: command.variables
      }
    })
  }
}

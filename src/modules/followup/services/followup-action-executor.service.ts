import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  LeadChannel,
  LeadChannelIdentity
} from '../../leads/entities/lead-channel-identity.entity'
import { Lead } from '../../leads/entities/lead.entity'
import {
  MessageChannel,
  MessageSource,
  MessageType
} from '../../leads/entities/message.entity'
import { LeadMessageDispatchService } from '../../leads/services/lead-message-dispatch.service'
import { MailService, SendMailInput } from '../../mail/mail.service'
import { buildFollowUpAutomationEmail } from '../../mail/templates/followup-automation-email.template'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { InstagramMessagingService } from '../../webhook/instagram-messaging.service'
import { MessengerMessagingService } from '../../webhook/messenger-messaging.service'
import { WhatsAppMessagingService } from '../../webhook/whatsapp-messaging.service'
import {
  FollowUpAction,
  FollowUpActionChannel,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'
import { Template } from '../entities/template.entity'

import { FollowUpConversationPolicy } from './followup-conversation-policy.service'
import { SendWhatsAppTemplateCommand } from './send-whatsapp-template.command'
import { WhatsAppTemplateSender } from './whatsapp-template-sender.service'

type FollowUpActionExecutionResult =
  | FollowUpActionStatus.EXECUTED
  | FollowUpActionStatus.MANUAL_REQUIRED

type MessageActionPayload = {
  message?: string
  phone?: string
  templateId?: string
  variables?: Record<string, unknown>
}

@Injectable()
export class FollowUpActionExecutor {
  constructor(
    @InjectRepository(LeadChannelIdentity)
    private readonly leadChannelIdentityRepository: Repository<LeadChannelIdentity>,
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>,
    private readonly conversationPolicy: FollowUpConversationPolicy,
    private readonly whatsAppMessagingService: WhatsAppMessagingService,
    private readonly whatsAppTemplateSender: WhatsAppTemplateSender,
    private readonly instagramMessagingService: InstagramMessagingService,
    private readonly messengerMessagingService: MessengerMessagingService,
    private readonly mailService: MailService,
    private readonly leadMessageDispatchService: LeadMessageDispatchService
  ) {}

  async execute(
    action: FollowUpAction,
    lead: Lead,
    negotiationId: string
  ): Promise<FollowUpActionExecutionResult> {
    if (action.channel === FollowUpActionChannel.AGENDA) {
      throw new Error('Agenda follow-up actions require manual completion')
    }

    if (action.type === FollowUpActionType.SEND_EMAIL) {
      await this.mailService.send(this.toMailInput(action.payload, lead))
      return FollowUpActionStatus.EXECUTED
    }

    if (action.type !== FollowUpActionType.SEND_MESSAGE || !action.channel) {
      throw new Error(`Unsupported follow-up action type: ${action.type}`)
    }

    return await this.executeMessage(action, lead, negotiationId)
  }

  private async executeMessage(
    action: FollowUpAction,
    lead: Lead,
    negotiationId: string
  ): Promise<FollowUpActionExecutionResult> {
    const channel = this.toMessageChannel(action.channel)
    const isWithinWindow =
      await this.conversationPolicy.isWithinMessagingWindow(lead.id, channel)
    const payload = this.toMessagePayload(action.payload)

    if (channel === MessageChannel.WHATSAPP) {
      return await this.executeWhatsApp(
        action,
        lead,
        negotiationId,
        payload,
        isWithinWindow
      )
    }

    if (!isWithinWindow) {
      return FollowUpActionStatus.MANUAL_REQUIRED
    }

    const message = this.requireTextMessage(payload)

    if (channel === MessageChannel.INSTAGRAM) {
      const identity = await this.findChannelIdentity(
        lead.id,
        LeadChannel.INSTAGRAM
      )
      await this.instagramMessagingService.sendMessage(
        identity.externalAccountId,
        identity.externalUserId,
        message
      )
      return FollowUpActionStatus.EXECUTED
    }

    if (channel === MessageChannel.MESSENGER) {
      const identity = await this.findChannelIdentity(
        lead.id,
        LeadChannel.MESSENGER
      )
      const userInformations = await this.findUserInformations(lead)
      const messengerToken = userInformations.messengerToken?.trim()

      if (
        !messengerToken ||
        userInformations.messengerPageId?.trim() !== identity.externalAccountId
      ) {
        throw new Error('Messenger Page or token is not configured for lead')
      }

      await this.messengerMessagingService.sendMessengerMessage(
        identity.externalUserId,
        message,
        identity.externalAccountId,
        messengerToken
      )
      return FollowUpActionStatus.EXECUTED
    }

    throw new Error(`Unsupported messaging channel: ${action.channel}`)
  }

  private toMessageChannel(
    channel: FollowUpActionChannel | null | undefined
  ): MessageChannel {
    if (channel === FollowUpActionChannel.WHATSAPP) {
      return MessageChannel.WHATSAPP
    }

    if (channel === FollowUpActionChannel.INSTAGRAM) {
      return MessageChannel.INSTAGRAM
    }

    if (channel === FollowUpActionChannel.MESSENGER) {
      return MessageChannel.MESSENGER
    }

    throw new Error(`Unsupported messaging channel: ${channel ?? 'none'}`)
  }

  private async executeWhatsApp(
    action: FollowUpAction,
    lead: Lead,
    negotiationId: string,
    payload: MessageActionPayload,
    isWithinWindow: boolean
  ): Promise<FollowUpActionExecutionResult> {
    const identity = await this.findChannelIdentity(
      lead.id,
      LeadChannel.WHATSAPP,
      false
    )
    const userInformations = await this.findUserInformations(lead)
    const destinationPhone =
      payload.phone?.trim() ||
      identity?.externalUserId.trim() ||
      lead.phone?.trim()
    const phoneNumberId =
      identity?.externalAccountId.trim() ||
      userInformations.phoneNumberId?.trim()
    const accessToken = userInformations.whatsappToken?.trim()

    if (!destinationPhone || !phoneNumberId || !accessToken) {
      throw new Error('WhatsApp context is not configured for lead')
    }

    if (isWithinWindow && payload.message?.trim()) {
      const response = await this.whatsAppMessagingService.sendWhatsAppMessage(
        destinationPhone,
        payload.message,
        phoneNumberId,
        accessToken
      )
      await this.leadMessageDispatchService.persistAndEmitOutboundMessage({
        leadId: lead.id,
        content: payload.message.trim(),
        type: MessageType.TEXT,
        source: MessageSource.NORMAL,
        whatsappMessageId: response.data.messages[0]?.id,
        metadata: { whatsappResponse: response.data }
      })
      return FollowUpActionStatus.EXECUTED
    }

    if (!payload.templateId?.trim()) {
      return FollowUpActionStatus.MANUAL_REQUIRED
    }

    const template = await this.templateRepository.findOne({
      where: { id: payload.templateId }
    })

    if (!template) {
      throw new Error(`MessageTemplate ${payload.templateId} not found`)
    }

    const command: SendWhatsAppTemplateCommand = {
      followUpId: action.followUpId,
      negotiationId,
      leadId: lead.id,
      templateId: template.id,
      phone: destinationPhone,
      phoneNumberId,
      accessToken,
      metaTemplateName: template.metaTemplateName,
      language: template.language,
      templateVariableDefinitions: template.variables ?? [],
      variables: payload.variables ?? {}
    }

    const response = await this.whatsAppTemplateSender.sendTemplate(command)
    const compiledContent = this.compileTemplateContent(
      template.description ?? '',
      payload.variables ?? {}
    )
    const templateType = template.category?.trim() || 'UNKNOWN'

    await this.leadMessageDispatchService.persistAndEmitOutboundMessage({
      leadId: lead.id,
      content: compiledContent,
      type: MessageType.TEXT,
      source: MessageSource.TEMPLATE,
      templateType,
      whatsappMessageId: response.messages?.[0]?.id,
      metadata: {
        templateId: template.id,
        templateName: template.name,
        templateType,
        templateVariables: payload.variables ?? {},
        whatsappResponse: response
      }
    })
    return FollowUpActionStatus.EXECUTED
  }

  private compileTemplateContent(
    description: string,
    variables: Record<string, unknown>
  ): string {
    return Object.entries(variables).reduce((content, [key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const replacement =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? String(value)
          : ''

      return content.replace(
        new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'),
        replacement
      )
    }, description)
  }

  private async findChannelIdentity(
    leadId: string,
    channel: LeadChannel
  ): Promise<LeadChannelIdentity>
  private async findChannelIdentity(
    leadId: string,
    channel: LeadChannel,
    required: false
  ): Promise<LeadChannelIdentity | null>
  private async findChannelIdentity(
    leadId: string,
    channel: LeadChannel,
    required = true
  ): Promise<LeadChannelIdentity | null> {
    const identity = await this.leadChannelIdentityRepository.findOne({
      where: { leadId, channel },
      order: { lastInteractionAt: 'DESC', createdAt: 'DESC' }
    })

    if (!identity && required) {
      throw new Error(`${channel} identity is not configured for lead`)
    }

    return identity
  }

  private async findUserInformations(lead: Lead): Promise<UserInformations> {
    if (!lead.userInformationsId) {
      throw new Error('UserInformations is not configured for lead')
    }

    const userInformations = await this.userInformationsRepository.findOne({
      where: { id: lead.userInformationsId }
    })

    if (!userInformations) {
      throw new Error('UserInformations not found for lead')
    }

    return userInformations
  }

  private toMessagePayload(
    payload?: Record<string, unknown> | null
  ): MessageActionPayload {
    if (!payload || typeof payload !== 'object') {
      return {}
    }

    return {
      message:
        typeof payload.message === 'string' ? payload.message : undefined,
      phone: typeof payload.phone === 'string' ? payload.phone : undefined,
      templateId:
        typeof payload.templateId === 'string' ? payload.templateId : undefined,
      variables:
        payload.variables && typeof payload.variables === 'object'
          ? (payload.variables as Record<string, unknown>)
          : undefined
    }
  }

  private requireTextMessage(payload: MessageActionPayload): string {
    const message = payload.message?.trim()

    if (!message) {
      throw new Error('Message action payload requires a message')
    }

    return message
  }

  private toMailInput(
    payload: Record<string, unknown> | null | undefined,
    lead: Lead
  ): SendMailInput {
    if (!payload) {
      throw new Error('Email action payload is required')
    }

    const { from, to, subject, html, text, replyTo } = payload
    let recipients: string | string[]

    if (typeof to === 'string') {
      recipients = to
    } else if (
      Array.isArray(to) &&
      to.every((recipient) => typeof recipient === 'string')
    ) {
      recipients = to
    } else {
      throw new Error('Email action payload requires to, subject and content')
    }

    if (
      typeof subject !== 'string' ||
      (typeof text !== 'string' && typeof html !== 'string')
    ) {
      throw new Error('Email action payload requires to, subject and content')
    }

    const message =
      typeof text === 'string' ? text : this.extractTextFromHtml(html as string)

    return {
      to: recipients,
      subject,
      html: buildFollowUpAutomationEmail({
        recipientName: lead.name,
        message
      }),
      from: typeof from === 'string' ? from : undefined,
      text: message,
      replyTo: typeof replyTo === 'string' ? replyTo : undefined
    }
  }

  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&#039;', "'")
      .replaceAll('&amp;', '&')
      .trim()
  }
}

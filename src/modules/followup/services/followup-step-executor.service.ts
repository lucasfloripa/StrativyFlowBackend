import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  LeadChannel,
  LeadChannelIdentity
} from '../../leads/entities/lead-channel-identity.entity'
import {
  Lead,
  LeadQualification,
  LeadState
} from '../../leads/entities/lead.entity'
import {
  MessageChannel,
  MessageSource,
  MessageType
} from '../../leads/entities/message.entity'
import { LeadMessageDispatchService } from '../../leads/services/lead-message-dispatch.service'
import { MailService, SendMailInput } from '../../mail/mail.service'
import { buildFollowUpAutomationEmail } from '../../mail/templates/followup-automation-email.template'
import {
  Negotiation,
  NegotiationStage,
  NegotiationStatus,
  NegotiationTemperature
} from '../../negotiation/entities/negotiation.entity'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { InstagramMessagingService } from '../../webhook/instagram-messaging.service'
import { MessengerMessagingService } from '../../webhook/messenger-messaging.service'
import { WhatsAppMessagingService } from '../../webhook/whatsapp-messaging.service'
import {
  FollowUpActionType,
  FollowUpStep,
  FollowUpStepChannel,
  FollowUpStepStatus,
  FollowUpStepType
} from '../entities/followup-step.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'
import { Template } from '../entities/template.entity'

import { FollowUpConversationPolicy } from './followup-conversation-policy.service'
import { SendWhatsAppTemplateCommand } from './send-whatsapp-template.command'
import { WhatsAppTemplateSender } from './whatsapp-template-sender.service'

type FollowUpStepExecutionResult =
  | FollowUpStepStatus.AWAITING_REPLY
  | FollowUpStepStatus.EXECUTED
  | FollowUpStepStatus.MANUAL_REQUIRED

export type FollowUpStepExecutionOutcome = {
  status: FollowUpStepExecutionResult
  result: Record<string, unknown>
}

type MessageActionPayload = {
  message?: string
  phone?: string
  templateId?: string
  variables?: Record<string, unknown>
}

@Injectable()
export class FollowUpStepExecutor {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    @InjectRepository(FollowUpStep)
    private readonly followUpStepRepository: Repository<FollowUpStep>,
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
    action: FollowUpStep,
    lead: Lead,
    negotiationId: string
  ): Promise<FollowUpStepExecutionResult> {
    const outcome = await this.executeWithResult(action, lead, negotiationId)

    return outcome.status
  }

  async executeWithResult(
    action: FollowUpStep,
    lead: Lead,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    if (action.channel === FollowUpStepChannel.AGENDA) {
      throw new Error('Agenda follow-up actions require manual completion')
    }

    const executableType = this.resolveExecutableType(action)

    if (executableType === FollowUpActionType.SEND_EMAIL) {
      await this.mailService.send(this.toMailInput(action.payload, lead))
      return {
        status: FollowUpStepStatus.EXECUTED,
        result: { success: true }
      }
    }

    if (executableType === FollowUpActionType.SEND_MESSAGE) {
      return await this.executeMessage(action, lead, negotiationId)
    }

    if (executableType === FollowUpActionType.CREATE_FOLLOW_UP) {
      return await this.executeCreateFollowUp(action, negotiationId)
    }

    if (executableType === FollowUpActionType.QUALIFY_LEAD) {
      return await this.executeQualifyLead(action, lead)
    }

    if (executableType === FollowUpActionType.CHANGE_STAGE) {
      return await this.executeChangeStage(action, negotiationId)
    }

    if (executableType === FollowUpActionType.CHANGE_STATUS) {
      return await this.executeChangeStatus(action, negotiationId)
    }

    if (executableType === FollowUpActionType.CHANGE_TEMPERATURE) {
      return await this.executeChangeTemperature(action, negotiationId)
    }

    if (executableType === FollowUpActionType.ARCHIVE_LEAD) {
      return await this.executeArchiveLead(lead)
    }

    if (executableType === FollowUpActionType.DELETE_LEAD) {
      return await this.executeDeleteLead(lead)
    }

    if (executableType === FollowUpActionType.DELETE_NEGOTIATION) {
      return await this.executeDeleteNegotiation(negotiationId)
    }

    throw new Error('Unsupported follow-up action type')
  }

  private resolveExecutableType(action: FollowUpStep): FollowUpActionType {
    if (action.type === FollowUpStepType.SEND_MESSAGE) {
      return FollowUpActionType.SEND_MESSAGE
    }

    if (action.type === FollowUpStepType.SEND_EMAIL) {
      return FollowUpActionType.SEND_EMAIL
    }

    if (action.type !== FollowUpStepType.ACTION) {
      throw new Error(`Unsupported follow-up action type: ${action.type}`)
    }

    if (!this.isFollowUpActionType(action.actionType)) {
      throw new Error(
        `Follow-up actionType ${action.actionType ?? 'unknown'} is not implemented yet`
      )
    }

    return action.actionType
  }

  private async executeMessage(
    action: FollowUpStep,
    lead: Lead,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    if (!action.channel) {
      throw new Error('Message action requires a channel')
    }

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
      return {
        status: FollowUpStepStatus.MANUAL_REQUIRED,
        result: {
          success: true,
          manualRequired: true
        }
      }
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
      return {
        status: FollowUpStepStatus.AWAITING_REPLY,
        result: { success: true }
      }
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
      return {
        status: FollowUpStepStatus.AWAITING_REPLY,
        result: { success: true }
      }
    }

    throw new Error(`Unsupported messaging channel: ${action.channel}`)
  }

  private toMessageChannel(
    channel: FollowUpStepChannel | null | undefined
  ): MessageChannel {
    if (channel === FollowUpStepChannel.WHATSAPP) {
      return MessageChannel.WHATSAPP
    }

    if (channel === FollowUpStepChannel.INSTAGRAM) {
      return MessageChannel.INSTAGRAM
    }

    if (channel === FollowUpStepChannel.MESSENGER) {
      return MessageChannel.MESSENGER
    }

    throw new Error(`Unsupported messaging channel: ${channel ?? 'none'}`)
  }

  private async executeWhatsApp(
    action: FollowUpStep,
    lead: Lead,
    negotiationId: string,
    payload: MessageActionPayload,
    isWithinWindow: boolean
  ): Promise<FollowUpStepExecutionOutcome> {
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
      return {
        status: FollowUpStepStatus.AWAITING_REPLY,
        result: { success: true }
      }
    }

    if (!payload.templateId?.trim()) {
      return {
        status: FollowUpStepStatus.MANUAL_REQUIRED,
        result: {
          success: true,
          manualRequired: true
        }
      }
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
    return {
      status: FollowUpStepStatus.AWAITING_REPLY,
      result: { success: true }
    }
  }

  private async executeCreateFollowUp(
    action: FollowUpStep,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    const payload = this.requireRecordPayload(
      action.payload,
      'Create follow-up action payload is required'
    )
    const title = this.requireNonEmptyString(
      payload,
      'title',
      'Create follow-up action payload requires title'
    )
    const dueAtValue = this.requireNonEmptyString(
      payload,
      'dueAt',
      'Create follow-up action payload requires dueAt'
    )
    const dueAt = this.parseDateString(
      dueAtValue,
      'Create follow-up action payload dueAt must be a valid date string'
    )
    const primaryStep = this.parseNestedPrimaryAction(payload.action)
    const sourceSteps = await this.followUpStepRepository.find({
      where: { followUpId: action.followUpId }
    })
    const descendantSteps = this.findDescendantSteps(action.id, sourceSteps)

    const followUp = this.followUpRepository.create({
      negotiationId,
      title,
      dueAt,
      status: FollowUpStatus.PENDING,
      completedAt: null,
      reminder1hSentAt: null,
      steps: [
        this.followUpRepository.manager.create(FollowUpStep, {
          parentId: null,
          type: primaryStep.type,
          actionType: primaryStep.actionType,
          conditionType: null,
          channel: primaryStep.channel,
          status: FollowUpStepStatus.PENDING,
          waitTime: null,
          waitUnit: null,
          scheduledAt: dueAt,
          payload: primaryStep.payload,
          result: null,
          executedAt: null,
          failureReason: null,
          replyMessageId: null,
          replyContent: null,
          replyType: null,
          repliedAt: null
        })
      ]
    })

    const createdFollowUp = await this.followUpRepository.save(followUp)
    const createdPrimaryStep = createdFollowUp.steps?.[0]

    if (!createdPrimaryStep?.id) {
      throw new Error('Created follow-up primary step id is missing')
    }

    for (const descendantStep of descendantSteps) {
      await this.followUpStepRepository.update(descendantStep.id, {
        followUpId: createdFollowUp.id,
        parentId:
          descendantStep.parentId === action.id
            ? createdPrimaryStep.id
            : descendantStep.parentId,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null,
        result: null,
        executedAt: null,
        failureReason: null,
        replyMessageId: null,
        replyContent: null,
        replyType: null,
        repliedAt: null
      })
    }

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        createdFollowUpId: createdFollowUp.id
      }
    }
  }

  private findDescendantSteps(
    rootStepId: string,
    steps: FollowUpStep[]
  ): FollowUpStep[] {
    const descendants: FollowUpStep[] = []
    const pendingParentIds = [rootStepId]

    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.shift()
      const children = steps.filter((step) => step.parentId === parentId)

      descendants.push(...children)
      pendingParentIds.push(...children.map((child) => child.id))
    }

    return descendants
  }

  private async executeQualifyLead(
    action: FollowUpStep,
    lead: Lead
  ): Promise<FollowUpStepExecutionOutcome> {
    const payload = this.requireRecordPayload(
      action.payload,
      'Qualify lead action payload is required'
    )
    const qualification = payload.qualification

    if (!this.isLeadQualification(qualification)) {
      throw new Error('Qualify lead action requires a valid qualification')
    }

    await this.leadRepository.update(lead.id, {
      leadQualification: qualification,
      lastActivityAt: new Date()
    })

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        qualification
      }
    }
  }

  private async executeChangeStage(
    action: FollowUpStep,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    const payload = this.requireRecordPayload(
      action.payload,
      'Change stage action payload is required'
    )
    const stage = payload.stage

    if (!this.isNegotiationStage(stage)) {
      throw new Error('Change stage action requires a valid negotiation stage')
    }

    const negotiation = await this.requireNegotiation(negotiationId)

    negotiation.stage = stage
    negotiation.status = this.toNegotiationStatus(stage)

    if (negotiation.status === NegotiationStatus.OPEN) {
      negotiation.closedAt = null
    } else if (!negotiation.closedAt) {
      negotiation.closedAt = new Date()
    }

    const savedNegotiation = await this.negotiationRepository.save(negotiation)
    await this.completePendingFollowUpsForClosedNegotiation(savedNegotiation)

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        stage: savedNegotiation.stage,
        status: savedNegotiation.status
      }
    }
  }

  private async executeChangeStatus(
    action: FollowUpStep,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    const payload = this.requireRecordPayload(
      action.payload,
      'Change status action payload is required'
    )
    const status = payload.status

    if (!this.isNegotiationStatus(status)) {
      throw new Error(
        'Change status action requires a valid negotiation status'
      )
    }

    const negotiation = await this.requireNegotiation(negotiationId)

    negotiation.status = status
    negotiation.stage = this.toNegotiationStage(status)

    if (negotiation.status === NegotiationStatus.OPEN) {
      negotiation.closedAt = null
    } else if (!negotiation.closedAt) {
      negotiation.closedAt = new Date()
    }

    const savedNegotiation = await this.negotiationRepository.save(negotiation)
    await this.completePendingFollowUpsForClosedNegotiation(savedNegotiation)

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        stage: savedNegotiation.stage,
        status: savedNegotiation.status
      }
    }
  }

  private async executeChangeTemperature(
    action: FollowUpStep,
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    const payload = this.requireRecordPayload(
      action.payload,
      'Change temperature action payload is required'
    )
    const temperature = payload.temperature

    if (!this.isNegotiationTemperature(temperature)) {
      throw new Error(
        'Change temperature action requires a valid negotiation temperature'
      )
    }

    const negotiation = await this.requireNegotiation(negotiationId)
    negotiation.temperature = temperature
    await this.negotiationRepository.save(negotiation)

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        temperature
      }
    }
  }

  private async executeArchiveLead(
    lead: Lead
  ): Promise<FollowUpStepExecutionOutcome> {
    await this.leadRepository.update(lead.id, {
      state: LeadState.ARCHIVED,
      isFavorite: false,
      lastActivityAt: new Date()
    })

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: { success: true }
    }
  }

  private async executeDeleteLead(
    lead: Lead
  ): Promise<FollowUpStepExecutionOutcome> {
    const persistedLead = await this.leadRepository.findOne({
      where: { id: lead.id }
    })

    if (!persistedLead) {
      throw new Error(`Lead ${lead.id} not found`)
    }

    await this.leadRepository.remove(persistedLead)

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        deletedLeadId: lead.id
      }
    }
  }

  private async executeDeleteNegotiation(
    negotiationId: string
  ): Promise<FollowUpStepExecutionOutcome> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId }
    })

    if (!negotiation) {
      throw new Error(`Negotiation ${negotiationId} not found`)
    }

    await this.negotiationRepository.remove(negotiation)

    return {
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        deletedNegotiationId: negotiationId
      }
    }
  }

  private requireRecordPayload(
    payload: Record<string, unknown> | null | undefined,
    errorMessage: string
  ): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(errorMessage)
    }

    return payload
  }

  private requireNonEmptyString(
    payload: Record<string, unknown>,
    key: string,
    errorMessage: string
  ): string {
    const value = payload[key]

    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(errorMessage)
    }

    return value.trim()
  }

  private parseDateString(value: string, errorMessage: string): Date {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      throw new Error(errorMessage)
    }

    return date
  }

  private parseNestedPrimaryAction(value: unknown): {
    type: FollowUpStepType
    actionType: FollowUpActionType
    channel: FollowUpStepChannel | null
    payload: Record<string, unknown> | null
  } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Create follow-up action payload requires action object')
    }

    const type = (value as { type?: unknown }).type
    const actionTypeValue = (value as { actionType?: unknown }).actionType
    const channelValue = (value as { channel?: unknown }).channel
    const nestedPayload = (value as { payload?: unknown }).payload

    if (
      type !== FollowUpStepType.ACTION &&
      type !== FollowUpStepType.SEND_MESSAGE &&
      type !== FollowUpStepType.SEND_EMAIL
    ) {
      throw new Error('Create follow-up action payload action.type is invalid')
    }

    const actionType =
      type === FollowUpStepType.SEND_MESSAGE
        ? FollowUpActionType.SEND_MESSAGE
        : type === FollowUpStepType.SEND_EMAIL
          ? FollowUpActionType.SEND_EMAIL
          : actionTypeValue

    if (
      !this.isFollowUpActionType(actionType) ||
      (actionType !== FollowUpActionType.SEND_MESSAGE &&
        actionType !== FollowUpActionType.SEND_EMAIL)
    ) {
      throw new Error(
        'Create follow-up action payload action.actionType is invalid'
      )
    }

    const channel =
      channelValue === null || channelValue === undefined
        ? null
        : this.toFollowUpStepChannel(channelValue)

    if (actionType === FollowUpActionType.SEND_MESSAGE && !channel) {
      throw new Error('Create follow-up action send_message requires channel')
    }

    if (
      nestedPayload !== null &&
      nestedPayload !== undefined &&
      (typeof nestedPayload !== 'object' || Array.isArray(nestedPayload))
    ) {
      throw new Error(
        'Create follow-up action payload action.payload is invalid'
      )
    }

    return {
      type,
      actionType,
      channel,
      payload:
        nestedPayload && typeof nestedPayload === 'object'
          ? (nestedPayload as Record<string, unknown>)
          : null
    }
  }

  private toFollowUpStepChannel(value: unknown): FollowUpStepChannel {
    if (value === FollowUpStepChannel.WHATSAPP) {
      return FollowUpStepChannel.WHATSAPP
    }

    if (value === FollowUpStepChannel.MESSENGER) {
      return FollowUpStepChannel.MESSENGER
    }

    if (value === FollowUpStepChannel.INSTAGRAM) {
      return FollowUpStepChannel.INSTAGRAM
    }

    if (value === FollowUpStepChannel.AGENDA) {
      return FollowUpStepChannel.AGENDA
    }

    throw new Error('Create follow-up action payload action.channel is invalid')
  }

  private isFollowUpActionType(value: unknown): value is FollowUpActionType {
    return (
      value === FollowUpActionType.SEND_MESSAGE ||
      value === FollowUpActionType.SEND_EMAIL ||
      value === FollowUpActionType.CREATE_FOLLOW_UP ||
      value === FollowUpActionType.QUALIFY_LEAD ||
      value === FollowUpActionType.CHANGE_STAGE ||
      value === FollowUpActionType.CHANGE_STATUS ||
      value === FollowUpActionType.CHANGE_TEMPERATURE ||
      value === FollowUpActionType.ARCHIVE_LEAD ||
      value === FollowUpActionType.DELETE_LEAD ||
      value === FollowUpActionType.DELETE_NEGOTIATION
    )
  }

  private isLeadQualification(value: unknown): value is LeadQualification {
    return (
      value === LeadQualification.QUALIFY ||
      value === LeadQualification.NOT_QUALIFY
    )
  }

  private isNegotiationStage(value: unknown): value is NegotiationStage {
    return (
      value === NegotiationStage.NEW ||
      value === NegotiationStage.CONTACTED ||
      value === NegotiationStage.QUALIFIED ||
      value === NegotiationStage.PROPOSAL_SENT ||
      value === NegotiationStage.NEGOTIATION ||
      value === NegotiationStage.WON ||
      value === NegotiationStage.LOST
    )
  }

  private isNegotiationStatus(value: unknown): value is NegotiationStatus {
    return (
      value === NegotiationStatus.OPEN ||
      value === NegotiationStatus.WON ||
      value === NegotiationStatus.LOST
    )
  }

  private isNegotiationTemperature(
    value: unknown
  ): value is NegotiationTemperature {
    return (
      value === NegotiationTemperature.HOT ||
      value === NegotiationTemperature.WARM ||
      value === NegotiationTemperature.COLD
    )
  }

  private toNegotiationStatus(stage: NegotiationStage): NegotiationStatus {
    if (stage === NegotiationStage.WON) {
      return NegotiationStatus.WON
    }

    if (stage === NegotiationStage.LOST) {
      return NegotiationStatus.LOST
    }

    return NegotiationStatus.OPEN
  }

  private toNegotiationStage(status: NegotiationStatus): NegotiationStage {
    if (status === NegotiationStatus.WON) {
      return NegotiationStage.WON
    }

    if (status === NegotiationStatus.LOST) {
      return NegotiationStage.LOST
    }

    return NegotiationStage.NEW
  }

  private async requireNegotiation(
    negotiationId: string
  ): Promise<Negotiation> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId }
    })

    if (!negotiation) {
      throw new Error(`Negotiation ${negotiationId} not found`)
    }

    return negotiation
  }

  private async completePendingFollowUpsForClosedNegotiation(
    negotiation: Negotiation
  ): Promise<void> {
    const isClosed =
      negotiation.status === NegotiationStatus.WON ||
      negotiation.status === NegotiationStatus.LOST

    if (!isClosed) {
      return
    }

    await this.followUpRepository.update(
      {
        negotiationId: negotiation.id,
        status: FollowUpStatus.PENDING
      },
      {
        status: FollowUpStatus.DONE,
        completedAt: new Date()
      }
    )
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

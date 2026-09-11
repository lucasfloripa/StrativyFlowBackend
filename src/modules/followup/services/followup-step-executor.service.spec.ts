import { Lead } from '../../leads/entities/lead.entity'
import {
  MessageChannel,
  MessageSource
} from '../../leads/entities/message.entity'
import { MailService } from '../../mail/mail.service'
import {
  Negotiation,
  NegotiationStage,
  NegotiationStatus,
  NegotiationTemperature
} from '../../negotiation/entities/negotiation.entity'
import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStep,
  FollowUpStepChannel,
  FollowUpStepStatus,
  FollowUpStepType
} from '../entities/followup-step.entity'
import { FollowUpStatus } from '../entities/followup.entity'

import { FollowUpConversationPolicy } from './followup-conversation-policy.service'
import { FollowUpStepExecutor } from './followup-step-executor.service'
import { WhatsAppTemplateSender } from './whatsapp-template-sender.service'

describe('FollowUpStepExecutor', () => {
  const lead = Object.assign(new Lead(), {
    id: 'lead-1',
    userInformationsId: 'user-info-1',
    name: 'Customer'
  })

  const createService = () => {
    const leadRepository = {
      update: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn()
    }
    const negotiationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn()
    }
    const followUpRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(),
      update: jest.fn(),
      manager: {
        create: jest.fn(
          (_entity: unknown, value: Record<string, unknown>) => value
        )
      }
    }
    const followUpStepRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    }
    const identityRepository = { findOne: jest.fn() }
    const templateRepository = { findOne: jest.fn() }
    const userInformationsRepository = { findOne: jest.fn() }
    const conversationPolicy = { isWithinMessagingWindow: jest.fn() }
    const whatsAppMessagingService = { sendWhatsAppMessage: jest.fn() }
    const whatsAppTemplateSender = { sendTemplate: jest.fn() }
    const instagramMessagingService = { sendMessage: jest.fn() }
    const messengerMessagingService = { sendMessengerMessage: jest.fn() }
    const mailService: jest.Mocked<Pick<MailService, 'send'>> = {
      send: jest.fn()
    }
    const leadMessageDispatchService = {
      persistAndEmitOutboundMessage: jest
        .fn()
        .mockResolvedValue({ success: true })
    }

    const service = new FollowUpStepExecutor(
      leadRepository as never,
      negotiationRepository as never,
      followUpRepository as never,
      followUpStepRepository as never,
      identityRepository as never,
      templateRepository as never,
      userInformationsRepository as never,
      conversationPolicy as unknown as FollowUpConversationPolicy,
      whatsAppMessagingService as never,
      whatsAppTemplateSender as unknown as WhatsAppTemplateSender,
      instagramMessagingService as never,
      messengerMessagingService as never,
      mailService as unknown as MailService,
      leadMessageDispatchService as never
    )

    return {
      service,
      leadRepository,
      negotiationRepository,
      followUpRepository,
      followUpStepRepository,
      identityRepository,
      templateRepository,
      userInformationsRepository,
      conversationPolicy,
      whatsAppMessagingService,
      whatsAppTemplateSender,
      instagramMessagingService,
      messengerMessagingService,
      mailService,
      leadMessageDispatchService
    }
  }

  const createAutomationAction = (
    actionType: FollowUpActionType,
    payload?: Record<string, unknown>
  ) =>
    Object.assign(new FollowUpStep(), {
      id: 'step-action',
      followUpId: 'followup-1',
      type: FollowUpStepType.ACTION,
      actionType,
      channel: null,
      payload
    })

  it('delegates SEND_EMAIL without checking a messaging window', async () => {
    const dependencies = createService()
    dependencies.mailService.send.mockResolvedValue({ id: 'email-1' })
    const action = Object.assign(new FollowUpStep(), {
      type: FollowUpStepType.SEND_EMAIL,
      payload: {
        to: 'customer@example.com',
        subject: 'Proposal',
        html: '<p>Proposal</p>'
      }
    })

    const status = await dependencies.service.execute(
      action,
      lead,
      'negotiation-1'
    )

    expect(status).toBe(FollowUpStepStatus.EXECUTED)
    const sentMail = dependencies.mailService.send.mock.calls[0]?.[0]

    expect(sentMail).toMatchObject({
      to: 'customer@example.com',
      subject: 'Proposal',
      text: 'Proposal'
    })
    expect(sentMail?.html).toContain('Olá, Customer')
    expect(sentMail?.html).toContain('>Proposal</div>')
    expect(sentMail?.html).not.toContain('<p>Proposal</p>')
    expect(
      dependencies.conversationPolicy.isWithinMessagingWindow
    ).not.toHaveBeenCalled()
  })

  it('supports canonical ACTION + SEND_EMAIL mapping', async () => {
    const dependencies = createService()
    dependencies.mailService.send.mockResolvedValue({ id: 'email-2' })
    const action = Object.assign(new FollowUpStep(), {
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.SEND_EMAIL,
      payload: {
        to: 'customer@example.com',
        subject: 'Follow up',
        html: '<p>Follow up</p>'
      }
    })

    const status = await dependencies.service.execute(
      action,
      lead,
      'negotiation-1'
    )

    expect(status).toBe(FollowUpStepStatus.EXECUTED)
    expect(dependencies.mailService.send).toHaveBeenCalledTimes(1)
  })

  it('creates a pending nested follow-up from CREATE_FOLLOW_UP payload', async () => {
    const dependencies = createService()
    dependencies.followUpRepository.save.mockResolvedValue({
      id: 'followup-2',
      steps: [{ id: 'nested-root' }]
    })
    const action = createAutomationAction(FollowUpActionType.CREATE_FOLLOW_UP, {
      title: 'Return to lead',
      dueAt: '2026-09-10T10:00:00.000Z',
      action: {
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.WHATSAPP,
        payload: { message: 'hello' }
      }
    })

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome.status).toBe(FollowUpStepStatus.EXECUTED)
    expect(outcome.result).toEqual({
      success: true,
      createdFollowUpId: 'followup-2'
    })
    expect(dependencies.followUpRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        negotiationId: 'negotiation-1',
        title: 'Return to lead',
        status: FollowUpStatus.PENDING
      })
    )
    expect(dependencies.followUpRepository.manager.create).toHaveBeenCalledWith(
      FollowUpStep,
      expect.objectContaining({
        status: FollowUpStepStatus.PENDING,
        scheduledAt: new Date('2026-09-10T10:00:00.000Z')
      })
    )
  })

  it('moves CREATE_FOLLOW_UP descendants to the created follow-up tree', async () => {
    const dependencies = createService()
    const action = createAutomationAction(FollowUpActionType.CREATE_FOLLOW_UP, {
      title: 'Return to lead',
      dueAt: '2026-09-10T10:00:00.000Z',
      action: {
        type: FollowUpStepType.ACTION,
        actionType: FollowUpActionType.SEND_MESSAGE,
        channel: FollowUpStepChannel.WHATSAPP,
        payload: { message: 'hello' }
      }
    })
    const responseCondition = Object.assign(new FollowUpStep(), {
      id: 'condition-1',
      followUpId: 'followup-1',
      parentId: action.id,
      type: FollowUpStepType.CONDITION,
      conditionType: FollowUpConditionType.RESPONSE_RECEIVED,
      status: FollowUpStepStatus.WAITING
    })
    const responseAction = Object.assign(new FollowUpStep(), {
      id: 'response-action-1',
      followUpId: 'followup-1',
      parentId: responseCondition.id,
      type: FollowUpStepType.ACTION,
      actionType: FollowUpActionType.QUALIFY_LEAD,
      status: FollowUpStepStatus.WAITING,
      waitTime: 5,
      scheduledAt: new Date('2026-09-10T09:05:00.000Z')
    })

    dependencies.followUpStepRepository.find.mockResolvedValue([
      action,
      responseCondition,
      responseAction
    ])
    dependencies.followUpRepository.save.mockResolvedValue({
      id: 'followup-2',
      steps: [{ id: 'nested-root' }]
    })

    await dependencies.service.executeWithResult(action, lead, 'negotiation-1')

    expect(dependencies.followUpStepRepository.update).toHaveBeenCalledWith(
      responseCondition.id,
      expect.objectContaining({
        followUpId: 'followup-2',
        parentId: 'nested-root',
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
    )
    expect(dependencies.followUpStepRepository.update).toHaveBeenCalledWith(
      responseAction.id,
      expect.objectContaining({
        followUpId: 'followup-2',
        parentId: responseCondition.id,
        status: FollowUpStepStatus.PENDING,
        scheduledAt: null
      })
    )
  })

  it('updates lead qualification and lastActivityAt for QUALIFY_LEAD', async () => {
    const dependencies = createService()
    const action = createAutomationAction(FollowUpActionType.QUALIFY_LEAD, {
      qualification: 'qualify'
    })

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome).toEqual({
      status: FollowUpStepStatus.EXECUTED,
      result: { success: true, qualification: 'qualify' }
    })
    const qualificationCalls = dependencies.leadRepository.update.mock
      .calls as Array<
      [string, { leadQualification?: string; lastActivityAt?: Date }]
    >
    const qualificationUpdate = qualificationCalls[0]?.[1]

    expect(qualificationUpdate?.leadQualification).toBe('qualify')
    expect(qualificationUpdate?.lastActivityAt).toBeInstanceOf(Date)
  })

  it('validates QUALIFY_LEAD payload enum', async () => {
    const dependencies = createService()
    const action = createAutomationAction(FollowUpActionType.QUALIFY_LEAD, {
      qualification: 'invalid'
    })

    await expect(
      dependencies.service.executeWithResult(action, lead, 'negotiation-1')
    ).rejects.toThrow('Qualify lead action requires a valid qualification')
  })

  it('updates stage/status/closedAt consistently for CHANGE_STAGE', async () => {
    const dependencies = createService()
    const negotiation = Object.assign(new Negotiation(), {
      id: 'negotiation-1',
      stage: NegotiationStage.NEW,
      status: NegotiationStatus.OPEN,
      closedAt: null
    })
    dependencies.negotiationRepository.findOne.mockResolvedValue(negotiation)
    dependencies.negotiationRepository.save.mockImplementation(
      (value: Negotiation) => Promise.resolve(value)
    )
    const action = createAutomationAction(FollowUpActionType.CHANGE_STAGE, {
      stage: NegotiationStage.WON
    })

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome).toEqual({
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        stage: NegotiationStage.WON,
        status: NegotiationStatus.WON
      }
    })
    expect(dependencies.followUpRepository.update).toHaveBeenCalledWith(
      {
        negotiationId: 'negotiation-1',
        status: FollowUpStatus.PENDING
      },
      expect.objectContaining({
        status: FollowUpStatus.DONE
      })
    )
    const followUpCalls = dependencies.followUpRepository.update.mock
      .calls as Array<[unknown, { completedAt?: Date }]>
    const followUpUpdate = followUpCalls[0]?.[1]

    expect(followUpUpdate?.completedAt).toBeInstanceOf(Date)
  })

  it('updates status/stage consistently for CHANGE_STATUS', async () => {
    const dependencies = createService()
    const negotiation = Object.assign(new Negotiation(), {
      id: 'negotiation-1',
      stage: NegotiationStage.CONTACTED,
      status: NegotiationStatus.OPEN,
      closedAt: null
    })
    dependencies.negotiationRepository.findOne.mockResolvedValue(negotiation)
    dependencies.negotiationRepository.save.mockImplementation(
      (value: Negotiation) => Promise.resolve(value)
    )
    const action = createAutomationAction(FollowUpActionType.CHANGE_STATUS, {
      status: NegotiationStatus.LOST
    })

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome).toEqual({
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        stage: NegotiationStage.LOST,
        status: NegotiationStatus.LOST
      }
    })
  })

  it('updates negotiation temperature for CHANGE_TEMPERATURE', async () => {
    const dependencies = createService()
    const negotiation = Object.assign(new Negotiation(), {
      id: 'negotiation-1',
      stage: NegotiationStage.NEW,
      status: NegotiationStatus.OPEN,
      temperature: null
    })
    dependencies.negotiationRepository.findOne.mockResolvedValue(negotiation)
    dependencies.negotiationRepository.save.mockImplementation(
      (value: Negotiation) => Promise.resolve(value)
    )
    const action = createAutomationAction(
      FollowUpActionType.CHANGE_TEMPERATURE,
      {
        temperature: NegotiationTemperature.HOT
      }
    )

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome).toEqual({
      status: FollowUpStepStatus.EXECUTED,
      result: {
        success: true,
        temperature: NegotiationTemperature.HOT
      }
    })
  })

  it('archives lead and clears favorite for ARCHIVE_LEAD', async () => {
    const dependencies = createService()
    const action = createAutomationAction(FollowUpActionType.ARCHIVE_LEAD, {})

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome.result).toEqual({ success: true })
    const archiveCalls = dependencies.leadRepository.update.mock.calls as Array<
      [
        string,
        {
          state?: string
          isFavorite?: boolean
          lastActivityAt?: Date
        }
      ]
    >
    const archiveUpdate = archiveCalls[0]?.[1]

    expect(archiveUpdate?.state).toBe('archived')
    expect(archiveUpdate?.isFavorite).toBe(false)
    expect(archiveUpdate?.lastActivityAt).toBeInstanceOf(Date)
  })

  it('hard deletes lead for DELETE_LEAD', async () => {
    const dependencies = createService()
    dependencies.leadRepository.findOne.mockResolvedValue(lead)
    const action = createAutomationAction(FollowUpActionType.DELETE_LEAD, {})

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome.result).toEqual({ success: true, deletedLeadId: 'lead-1' })
    expect(dependencies.leadRepository.remove).toHaveBeenCalledWith(lead)
  })

  it('hard deletes negotiation for DELETE_NEGOTIATION', async () => {
    const dependencies = createService()
    const negotiation = Object.assign(new Negotiation(), {
      id: 'negotiation-1'
    })
    dependencies.negotiationRepository.findOne.mockResolvedValue(negotiation)
    const action = createAutomationAction(
      FollowUpActionType.DELETE_NEGOTIATION,
      {}
    )

    const outcome = await dependencies.service.executeWithResult(
      action,
      lead,
      'negotiation-1'
    )

    expect(outcome.result).toEqual({
      success: true,
      deletedNegotiationId: 'negotiation-1'
    })
    expect(dependencies.negotiationRepository.remove).toHaveBeenCalledWith(
      negotiation
    )
  })

  it.each([MessageChannel.INSTAGRAM, MessageChannel.MESSENGER])(
    'requires manual handling for %s outside its window',
    async (channel) => {
      const dependencies = createService()
      dependencies.conversationPolicy.isWithinMessagingWindow.mockResolvedValue(
        false
      )
      const action = Object.assign(new FollowUpStep(), {
        type: FollowUpStepType.SEND_MESSAGE,
        channel,
        payload: { message: 'Hello' }
      })

      const status = await dependencies.service.execute(
        action,
        lead,
        'negotiation-1'
      )

      expect(status).toBe(FollowUpStepStatus.MANUAL_REQUIRED)
      expect(
        dependencies.instagramMessagingService.sendMessage
      ).not.toHaveBeenCalled()
      expect(
        dependencies.messengerMessagingService.sendMessengerMessage
      ).not.toHaveBeenCalled()
    }
  )

  it('sends a plain WhatsApp message inside its channel window', async () => {
    const dependencies = createService()
    dependencies.conversationPolicy.isWithinMessagingWindow.mockResolvedValue(
      true
    )
    dependencies.identityRepository.findOne.mockResolvedValue({
      externalAccountId: 'phone-number-id',
      externalUserId: '5511999999999'
    })
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      whatsappToken: 'token'
    })
    dependencies.whatsAppMessagingService.sendWhatsAppMessage.mockResolvedValue(
      {
        data: {
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.text-1' }]
        }
      }
    )
    const action = Object.assign(new FollowUpStep(), {
      type: FollowUpStepType.SEND_MESSAGE,
      channel: MessageChannel.WHATSAPP,
      payload: { message: 'Hello' }
    })

    const status = await dependencies.service.execute(
      action,
      lead,
      'negotiation-1'
    )

    expect(status).toBe(FollowUpStepStatus.AWAITING_REPLY)
    expect(
      dependencies.whatsAppMessagingService.sendWhatsAppMessage
    ).toHaveBeenCalledWith('5511999999999', 'Hello', 'phone-number-id', 'token')
    expect(
      dependencies.whatsAppTemplateSender.sendTemplate
    ).not.toHaveBeenCalled()
    expect(
      dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        content: 'Hello',
        source: MessageSource.NORMAL,
        whatsappMessageId: 'wamid.text-1'
      })
    )
  })

  it('sends a WhatsApp template outside the channel window', async () => {
    const dependencies = createService()
    dependencies.conversationPolicy.isWithinMessagingWindow.mockResolvedValue(
      false
    )
    dependencies.identityRepository.findOne.mockResolvedValue({
      externalAccountId: 'phone-number-id',
      externalUserId: '5511999999999'
    })
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      whatsappToken: 'token'
    })
    dependencies.templateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      name: 'Proposal',
      description: 'Olá, {{name}}',
      category: 'MARKETING',
      metaTemplateName: 'proposal',
      language: 'pt_BR',
      variables: []
    })
    dependencies.whatsAppTemplateSender.sendTemplate.mockResolvedValue({
      messages: [{ id: 'wamid.template-1' }]
    })
    const action = Object.assign(new FollowUpStep(), {
      id: 'action-1',
      followUpId: 'followup-1',
      type: FollowUpStepType.SEND_MESSAGE,
      channel: MessageChannel.WHATSAPP,
      payload: {
        phone: '5548999990000',
        templateId: 'template-1',
        variables: { name: 'Lucas' }
      }
    })

    const status = await dependencies.service.execute(
      action,
      lead,
      'negotiation-1'
    )

    expect(status).toBe(FollowUpStepStatus.AWAITING_REPLY)
    expect(
      dependencies.whatsAppTemplateSender.sendTemplate
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        followUpId: 'followup-1',
        templateId: 'template-1',
        phone: '5548999990000',
        variables: { name: 'Lucas' }
      })
    )
    expect(
      dependencies.whatsAppMessagingService.sendWhatsAppMessage
    ).not.toHaveBeenCalled()
    expect(
      dependencies.leadMessageDispatchService.persistAndEmitOutboundMessage
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        content: 'Olá, Lucas',
        source: MessageSource.TEMPLATE,
        templateType: 'MARKETING',
        whatsappMessageId: 'wamid.template-1'
      })
    )
  })
})

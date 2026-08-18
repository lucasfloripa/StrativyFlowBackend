import { Lead } from '../../leads/entities/lead.entity'
import {
  MessageChannel,
  MessageSource
} from '../../leads/entities/message.entity'
import { MailService } from '../../mail/mail.service'
import {
  FollowUpAction,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'

import { FollowUpActionExecutor } from './followup-action-executor.service'
import { FollowUpConversationPolicy } from './followup-conversation-policy.service'
import { WhatsAppTemplateSender } from './whatsapp-template-sender.service'

describe('FollowUpActionExecutor', () => {
  const lead = Object.assign(new Lead(), {
    id: 'lead-1',
    userInformationsId: 'user-info-1'
  })

  const createService = () => {
    const identityRepository = { findOne: jest.fn() }
    const templateRepository = { findOne: jest.fn() }
    const userInformationsRepository = { findOne: jest.fn() }
    const conversationPolicy = { isWithinMessagingWindow: jest.fn() }
    const whatsAppMessagingService = { sendWhatsAppMessage: jest.fn() }
    const whatsAppTemplateSender = { sendTemplate: jest.fn() }
    const instagramMessagingService = { sendMessage: jest.fn() }
    const messengerMessagingService = { sendMessengerMessage: jest.fn() }
    const mailService = { send: jest.fn() }
    const leadMessageDispatchService = {
      persistAndEmitOutboundMessage: jest
        .fn()
        .mockResolvedValue({ success: true })
    }

    const service = new FollowUpActionExecutor(
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

  it('delegates SEND_EMAIL without checking a messaging window', async () => {
    const dependencies = createService()
    dependencies.mailService.send.mockResolvedValue({ id: 'email-1' })
    const action = Object.assign(new FollowUpAction(), {
      type: FollowUpActionType.SEND_EMAIL,
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

    expect(status).toBe(FollowUpActionStatus.EXECUTED)
    expect(dependencies.mailService.send).toHaveBeenCalledWith(action.payload)
    expect(
      dependencies.conversationPolicy.isWithinMessagingWindow
    ).not.toHaveBeenCalled()
  })

  it.each([MessageChannel.INSTAGRAM, MessageChannel.MESSENGER])(
    'requires manual handling for %s outside its window',
    async (channel) => {
      const dependencies = createService()
      dependencies.conversationPolicy.isWithinMessagingWindow.mockResolvedValue(
        false
      )
      const action = Object.assign(new FollowUpAction(), {
        type: FollowUpActionType.SEND_MESSAGE,
        channel,
        payload: { message: 'Hello' }
      })

      const status = await dependencies.service.execute(
        action,
        lead,
        'negotiation-1'
      )

      expect(status).toBe(FollowUpActionStatus.MANUAL_REQUIRED)
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
    const action = Object.assign(new FollowUpAction(), {
      type: FollowUpActionType.SEND_MESSAGE,
      channel: MessageChannel.WHATSAPP,
      payload: { message: 'Hello' }
    })

    const status = await dependencies.service.execute(
      action,
      lead,
      'negotiation-1'
    )

    expect(status).toBe(FollowUpActionStatus.EXECUTED)
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
    const action = Object.assign(new FollowUpAction(), {
      id: 'action-1',
      followUpId: 'followup-1',
      type: FollowUpActionType.SEND_MESSAGE,
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

    expect(status).toBe(FollowUpActionStatus.EXECUTED)
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

import { Repository } from 'typeorm'

import { AutomationMessagingService } from '../../automation/services/automation-messaging.service'
import { Message, MessageDirection } from '../../leads/entities/message.entity'
import { Lead, LeadFlowState } from '../../leads/entities/lead.entity'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { NotificationService } from '../notification.service'
import { MessageReceivedHandler } from './message-received.handler'

describe('MessageReceivedHandler', () => {
  let handler: MessageReceivedHandler
  let notificationService: jest.Mocked<Pick<NotificationService, 'createNotification'>>
  let automationMessagingService: jest.Mocked<Pick<AutomationMessagingService, 'sendWhatsAppMessage'>>
  let userInformationsRepo: jest.Mocked<Pick<Repository<UserInformations>, 'findOne'>>
  let messageRepo: jest.Mocked<Pick<Repository<Message>, 'findOne' | 'save'>>
  let leadRepo: jest.Mocked<Pick<Repository<Lead>, 'findOne'>>

  beforeEach(() => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({} as never)
    }

    automationMessagingService = {
      sendWhatsAppMessage: jest.fn().mockResolvedValue({} as never)
    }

    userInformationsRepo = {
      findOne: jest.fn()
    }

    messageRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      })
    }

    leadRepo = {
      findOne: jest.fn()
    }

    handler = new MessageReceivedHandler(
      notificationService as unknown as NotificationService,
      automationMessagingService as unknown as AutomationMessagingService,
      userInformationsRepo as unknown as Repository<UserInformations>,
      messageRepo as unknown as Repository<Message>,
      leadRepo as unknown as Repository<Lead>
    )
  })

  it('skips message notifications before the lead reaches the initial conversation state', async () => {
    leadRepo.findOne.mockResolvedValue({ flowState: LeadFlowState.ASKING_NAME } as Lead)

    await handler.handle({
      data: {
        userId: 'user-1',
        messageId: 'message-1',
        leadId: 'lead-1',
        leadName: 'João Silva Gonçalves'
      }
    } as never)

    expect(notificationService.createNotification).not.toHaveBeenCalled()
    expect(automationMessagingService.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('creates message notifications after the lead reaches the in-conversation state', async () => {
    leadRepo.findOne.mockResolvedValue({ flowState: LeadFlowState.IN_CONVERSATION } as Lead)
    userInformationsRepo.findOne.mockResolvedValue({
      notificationPreferences: { MESSAGE_RECEIVED: ['APP', 'WHATSAPP'] },
      notificationWhatsAppNumbers: ['+5511999999999'],
      phoneNumberId: 'phone-id',
      whatsappToken: 'token'
    } as UserInformations)
    messageRepo.findOne.mockResolvedValue({
      id: 'message-1',
      leadId: 'lead-1',
      direction: MessageDirection.INBOUND,
      createdAt: new Date(),
      metadata: {}
    } as Message)

    await handler.handle({
      data: {
        userId: 'user-1',
        messageId: 'message-1',
        leadId: 'lead-1',
        leadName: 'João Silva Gonçalves'
      }
    } as never)

    expect(notificationService.createNotification).toHaveBeenCalledTimes(1)
    expect(automationMessagingService.sendWhatsAppMessage).toHaveBeenCalledWith(
      '+5511999999999',
      'Lead João Silva Gonçalves mandou mensagem no Flow!',
      'phone-id',
      'token'
    )
  })
})

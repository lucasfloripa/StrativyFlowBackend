import { Repository } from 'typeorm'

import { AutomationMessagingService } from '../../automation/services/automation-messaging.service'
import { MailService } from '../../mail/mail.service'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { NotificationService } from '../notification.service'

import { LeadCreatedHandler } from './lead-created.handler'

describe('LeadCreatedHandler', () => {
  it('sends the configured WhatsApp notification for a Messenger lead', async () => {
    const notificationService = {
      createNotification: jest.fn()
    }
    const mailService = {
      send: jest.fn()
    }
    const automationMessagingService = {
      sendWhatsAppMessage: jest.fn().mockResolvedValue({})
    }
    const userInformationsRepo = {
      findOne: jest.fn().mockResolvedValue({
        notificationPreferences: { NEW_LEAD: ['WHATSAPP'] },
        notificationWhatsAppNumbers: ['+5511999999999'],
        phoneNumberId: 'phone-number-id',
        whatsappToken: 'whatsapp-token'
      } as UserInformations)
    }
    const handler = new LeadCreatedHandler(
      notificationService as unknown as NotificationService,
      mailService as unknown as MailService,
      automationMessagingService as unknown as AutomationMessagingService,
      userInformationsRepo as unknown as Repository<UserInformations>
    )

    await handler.handle({
      data: {
        userId: 'user-1',
        leadId: 'lead-1',
        leadName: 'Cliente Messenger',
        description: 'Cliente Messenger',
        origin: 'webhook',
        source: 'messenger'
      }
    } as never)

    expect(automationMessagingService.sendWhatsAppMessage).toHaveBeenCalledWith(
      '+5511999999999',
      'Tem novo Lead no Flow!',
      'phone-number-id',
      'whatsapp-token'
    )
    expect(notificationService.createNotification).not.toHaveBeenCalled()
    expect(mailService.send).not.toHaveBeenCalled()
  })
})

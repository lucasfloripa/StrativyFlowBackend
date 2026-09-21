import { Repository } from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentMethod
} from '../negotiation/entities/negotiation-payment.entity'
import {
  NotificationReferenceType,
  NotificationType as AppNotificationType
} from '../notification/entities/notification.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { NotificationService } from '../notification/notification.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { PaymentDueTomorrowCronService } from './payment-due-tomorrow-cron.service'

describe('PaymentDueTomorrowCronService', () => {
  it('sends tomorrow payment list through enabled channels', async () => {
    const paymentRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'payment-id',
          amount: '150.50',
          paymentMethod: NegotiationPaymentMethod.PIX,
          dueDate: new Date('2026-09-13T15:00:00.000Z'),
          negotiationFinancial: {
            negotiation: {
              lead: {
                name: 'Maria',
                userInformationsId: 'user-information-id'
              }
            }
          }
        }
      ])
    } as unknown as Repository<NegotiationPayment>
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'user-information-id',
          userId: 'user-id',
          notificationEmails: ['MARIA@example.com'],
          notificationWhatsAppNumbers: ['5511999999999'],
          notificationPreferences: {
            [NotificationType.INSTALLMENT_DUE_TOMORROW]: [
              NotificationChannel.APP,
              NotificationChannel.EMAIL,
              NotificationChannel.WHATSAPP
            ]
          }
        }
      ])
    } as unknown as Repository<UserInformations>
    const mailService = { send: jest.fn().mockResolvedValue(undefined) }
    const evolutionService = {
      sendText: jest.fn().mockResolvedValue(undefined)
    }
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined)
    } as unknown as NotificationService
    const service = new PaymentDueTomorrowCronService(
      paymentRepository,
      userInformationsRepository,
      mailService as never,
      evolutionService as never,
      notificationService
    )

    const summary = await service.dispatchPaymentDueTomorrowReminders(
      'manual',
      new Date('2026-09-12T12:00:00.000Z')
    )
    const findOptions = jest.mocked(paymentRepository.find).mock.calls[0]?.[0]

    expect(findOptions?.where).toMatchObject({ status: 'PENDING' })
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      organizationId: null,
      userId: 'user-id',
      type: AppNotificationType.PAYMENT_DUE_TOMORROW,
      title: 'Pagamentos vencendo amanhã',
      description: '1 pagamento com vencimento amanhã',
      referenceType: NotificationReferenceType.PAYMENT,
      referenceId: 'payment-id'
    })
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['maria@example.com'],
        subject: 'Pagamentos vencendo amanhã'
      })
    )
    expect(evolutionService.sendText).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Maria')
    )
    expect(summary).toEqual({
      source: 'manual',
      pendingPaymentsDueTomorrow: 1,
      usersGrouped: 1,
      usersNotified: 1,
      paymentsIncluded: 1
    })
  })
})

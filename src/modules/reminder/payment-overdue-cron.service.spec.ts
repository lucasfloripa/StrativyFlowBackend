import { Repository } from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentMethod
} from '../negotiation/entities/negotiation-payment.entity'
import { NegotiationPaymentCronService } from '../negotiation/services/negotiation-payment-cron.service'
import {
  NotificationReferenceType,
  NotificationType as AppNotificationType
} from '../notification/entities/notification.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { NotificationService } from '../notification/notification.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { PaymentOverdueCronService } from './payment-overdue-cron.service'

describe('PaymentOverdueCronService', () => {
  it('updates statuses and sends overdue payment list through enabled channels', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'payment-id',
        amount: '275.90',
        paymentMethod: NegotiationPaymentMethod.CREDIT_CARD,
        dueDate: new Date('2026-09-10T15:00:00.000Z'),
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
    const paymentRepository = {
      find
    } as unknown as Repository<NegotiationPayment>
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'user-information-id',
          userId: 'user-id',
          notificationEmails: ['MARIA@example.com'],
          notificationWhatsAppNumbers: ['5511999999999'],
          notificationPreferences: {
            [NotificationType.INSTALLMENT_OVERDUE]: [
              NotificationChannel.APP,
              NotificationChannel.EMAIL,
              NotificationChannel.WHATSAPP
            ]
          }
        }
      ])
    } as unknown as Repository<UserInformations>
    const markOverduePayments = jest.fn().mockResolvedValue(undefined)
    const paymentStatusCronService = {
      markOverduePayments
    } as unknown as NegotiationPaymentCronService
    const mailService = { send: jest.fn().mockResolvedValue(undefined) }
    const evolutionService = {
      sendText: jest.fn().mockResolvedValue(undefined)
    }
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined)
    } as unknown as NotificationService
    const service = new PaymentOverdueCronService(
      paymentRepository,
      userInformationsRepository,
      paymentStatusCronService,
      mailService as never,
      evolutionService as never,
      notificationService
    )

    const summary = await service.dispatchOverduePaymentReminders('manual')
    const findOptions = jest.mocked(paymentRepository.find).mock.calls[0]?.[0]

    expect(markOverduePayments).toHaveBeenCalledTimes(1)
    expect(markOverduePayments.mock.invocationCallOrder[0]).toBeLessThan(
      find.mock.invocationCallOrder[0]
    )
    expect(findOptions?.where).toEqual({ status: 'OVERDUE' })
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      organizationId: null,
      userId: 'user-id',
      type: AppNotificationType.PAYMENT_OVERDUE,
      title: 'Pagamentos vencidos',
      description: '1 pagamento vencido',
      referenceType: NotificationReferenceType.PAYMENT,
      referenceId: 'payment-id'
    })
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['maria@example.com'],
        subject: 'Lista de pagamentos vencidos'
      })
    )
    expect(evolutionService.sendText).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Maria')
    )
    expect(summary).toEqual({
      source: 'manual',
      overduePayments: 1,
      usersGrouped: 1,
      usersNotified: 1,
      paymentsIncluded: 1
    })
  })
})

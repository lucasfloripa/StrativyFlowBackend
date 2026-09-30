import { NegotiationPaymentStatusService } from '../../modules/negotiation/services/negotiation-payment-status.service'
import { RabbitPublisherService } from '../../modules/rabbit/services/rabbit-publisher.service'

import { PAYMENT_MARK_OVERDUE_EVENT } from './payment-job.constants'
import { PaymentScheduler } from './payment-scheduler.service'

describe('PaymentScheduler', () => {
  it('publishes one mark-overdue job for each eligible payment ID in batch', async () => {
    const findOverduePaymentIds = jest
      .fn()
      .mockResolvedValue(['payment-1', 'payment-2'])
    const publishMany = jest.fn().mockResolvedValue(undefined)
    const scheduler = new PaymentScheduler(
      { findOverduePaymentIds } as unknown as NegotiationPaymentStatusService,
      { publishMany } as unknown as RabbitPublisherService
    )

    await scheduler.scheduleOverduePayments()

    expect(findOverduePaymentIds).toHaveBeenCalledTimes(1)
    expect(publishMany).toHaveBeenCalledWith([
      {
        routingKey: PAYMENT_MARK_OVERDUE_EVENT,
        payload: { paymentId: 'payment-1' }
      },
      {
        routingKey: PAYMENT_MARK_OVERDUE_EVENT,
        payload: { paymentId: 'payment-2' }
      }
    ])
  })

  it('does not publish when no pending payment matches the overdue criteria', async () => {
    const findOverduePaymentIds = jest.fn().mockResolvedValue([])
    const publishMany = jest.fn()
    const scheduler = new PaymentScheduler(
      { findOverduePaymentIds } as unknown as NegotiationPaymentStatusService,
      { publishMany } as unknown as RabbitPublisherService
    )

    await scheduler.scheduleOverduePayments()

    expect(publishMany).not.toHaveBeenCalled()
  })

  it('handles failures without interrupting the scheduler', async () => {
    const findOverduePaymentIds = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'))
    const scheduler = new PaymentScheduler(
      { findOverduePaymentIds } as unknown as NegotiationPaymentStatusService,
      { publishMany: jest.fn() } as unknown as RabbitPublisherService
    )

    await expect(scheduler.scheduleOverduePayments()).resolves.toBeUndefined()
  })
})

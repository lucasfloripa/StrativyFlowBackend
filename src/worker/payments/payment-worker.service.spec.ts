import { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'
import { RabbitSubscription } from '../../modules/rabbit/interfaces/rabbit-subscription.interface'

import {
  PAYMENT_MARK_OVERDUE_JOB,
  PAYMENT_QUEUE
} from './payment-job.constants'
import { PaymentWorker } from './payment-worker.service'

describe('PaymentWorker', () => {
  it('subscribes to payment.queue and delegates mark-overdue jobs', async () => {
    let subscription: RabbitSubscription | undefined
    const subscribe = jest.fn((options: RabbitSubscription) => {
      subscription = options
      return Promise.resolve()
    })
    const markPaymentOverdue = jest.fn().mockResolvedValue(1)
    const worker = new PaymentWorker(
      { subscribe } as never,
      { markPaymentOverdue } as never
    )

    await worker.onModuleInit()

    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(subscription?.queue).toBe(PAYMENT_QUEUE)
    expect(subscription?.routingKey).toBe(PAYMENT_MARK_OVERDUE_JOB)

    const message: RabbitMessage = {
      eventId: 'event-id',
      event: PAYMENT_MARK_OVERDUE_JOB,
      occurredAt: '2026-09-28T00:00:00.000Z',
      data: { paymentId: 'payment-id' }
    }

    await subscription?.handler(message)

    expect(markPaymentOverdue).toHaveBeenCalledWith('payment-id')
  })
})

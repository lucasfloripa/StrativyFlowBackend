import { FindOperator, Repository, UpdateResult } from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

import { NegotiationPaymentCronService } from './negotiation-payment-cron.service'

describe('NegotiationPaymentCronService', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('marks only pending payments before today as overdue', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T07:00:00.000Z'))

    const update = jest
      .fn<
        Promise<UpdateResult>,
        Parameters<Repository<NegotiationPayment>['update']>
      >()
      .mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })
    const paymentRepository = {
      update
    } as unknown as Repository<NegotiationPayment>
    const service = new NegotiationPaymentCronService(paymentRepository)

    await service.markOverduePayments()

    expect(update).toHaveBeenCalledTimes(1)
    const [criteria] = update.mock.calls[0]
    const dueDateFilter = criteria.dueDate as FindOperator<Date>

    expect(criteria.status).toBe(NegotiationPaymentStatus.PENDING)
    expect(dueDateFilter).toBeInstanceOf(FindOperator)
    expect(dueDateFilter.value).toEqual(new Date('2026-08-26T00:00:00.000Z'))
    expect(update).toHaveBeenCalledWith(criteria, {
      status: NegotiationPaymentStatus.OVERDUE
    })
  })
})

import {
  FindOperator,
  FindOptionsWhere,
  Repository,
  UpdateResult
} from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

import { NegotiationPaymentStatusService } from './negotiation-payment-status.service'

describe('NegotiationPaymentStatusService', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('finds IDs only for pending payments due before today UTC', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T07:00:00.000Z'))

    let findOptions: FindOptionsWhere<NegotiationPayment> | undefined
    const find = jest.fn(
      (options: { where?: FindOptionsWhere<NegotiationPayment> }) => {
        findOptions = options.where
        return Promise.resolve([{ id: 'payment-id' } as NegotiationPayment])
      }
    )
    const paymentRepository = {
      find
    } as unknown as Repository<NegotiationPayment>
    const service = new NegotiationPaymentStatusService(paymentRepository)

    await expect(service.findOverduePaymentIds()).resolves.toEqual([
      'payment-id'
    ])

    expect(find).toHaveBeenCalledTimes(1)
    expect(findOptions?.status).toBe(NegotiationPaymentStatus.PENDING)
    const dueDateFilter = findOptions?.dueDate as FindOperator<Date>
    expect(dueDateFilter.value).toEqual(new Date('2026-08-26T00:00:00.000Z'))
  })

  it('marks only the specified payment if it is still pending and overdue', async () => {
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
    const service = new NegotiationPaymentStatusService(paymentRepository)

    await expect(service.markPaymentOverdue('payment-id')).resolves.toBe(1)

    const [criteria, changes] = update.mock.calls[0]
    expect(criteria.id).toBe('payment-id')
    expect(criteria.status).toBe(NegotiationPaymentStatus.PENDING)
    expect((criteria.dueDate as FindOperator<Date>).value).toEqual(
      new Date('2026-08-26T00:00:00.000Z')
    )
    expect(changes).toEqual({ status: NegotiationPaymentStatus.OVERDUE })
  })
})

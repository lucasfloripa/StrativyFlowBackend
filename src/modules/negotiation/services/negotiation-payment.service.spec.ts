import { EntityManager, Repository } from 'typeorm'

import { CreateNegotiationPaymentInstallmentsDto } from '../dto/create-negotiation-payment-installments.dto'
import { CreateNegotiationPaymentDto } from '../dto/create-negotiation-payment.dto'
import { NegotiationAttachment } from '../entities/negotiation-attachment.entity'
import {
  NegotiationPayment,
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

import { NegotiationFinancialService } from './negotiation-financial.service'
import { NegotiationPaymentService } from './negotiation-payment.service'

describe('NegotiationPaymentService', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('splits the total amount across installments and persists them in a transaction', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00.000Z'))

    const savedPayments: Partial<NegotiationPayment>[] = []
    const manager = {
      create: jest.fn(
        (
          _entity: typeof NegotiationPayment,
          data: Partial<NegotiationPayment>
        ) => data
      ),
      save: jest.fn((payment: Partial<NegotiationPayment>) => {
        savedPayments.push(payment)
        return Promise.resolve(payment)
      })
    }
    const paymentRepository = {
      manager: {
        transaction: jest.fn(
          (operation: (entityManager: EntityManager) => unknown) =>
            operation(manager as unknown as EntityManager)
        )
      }
    } as unknown as Repository<NegotiationPayment>
    const financialService = {
      findOwnedFinancial: jest.fn().mockResolvedValue({ id: 'financial-1' })
    } as unknown as NegotiationFinancialService
    const service = new NegotiationPaymentService(
      paymentRepository,
      financialService,
      {} as Repository<NegotiationAttachment>
    )
    const dto: CreateNegotiationPaymentInstallmentsDto = {
      amount: '100.01',
      paymentMethod: NegotiationPaymentMethod.CREDIT_CARD,
      dueDate: '2026-01-10',
      installmentCount: 3
    }

    const result = await service.createInstallments(
      'user-1',
      'negotiation-1',
      dto
    )

    expect(result).toHaveLength(3)
    expect(savedPayments.map((payment) => payment.amount)).toEqual([
      '33.34',
      '33.34',
      '33.33'
    ])
    expect(
      savedPayments.every(
        (payment) =>
          payment.negotiationFinancialId === 'financial-1' &&
          payment.paymentMethod === NegotiationPaymentMethod.CREDIT_CARD &&
          payment.status === NegotiationPaymentStatus.PENDING &&
          payment.paidAt === null
      )
    ).toBe(true)
  })

  it('does not change payment statuses when listing', async () => {
    const payments = [
      {
        id: 'past-pending',
        status: NegotiationPaymentStatus.PENDING,
        dueDate: new Date('2026-08-26T00:00:00.000Z')
      },
      {
        id: 'today-pending',
        status: NegotiationPaymentStatus.PENDING,
        dueDate: new Date('2026-08-27T00:00:00.000Z')
      },
      {
        id: 'future-pending',
        status: NegotiationPaymentStatus.PENDING,
        dueDate: new Date('2026-08-28T00:00:00.000Z')
      },
      {
        id: 'past-paid',
        status: NegotiationPaymentStatus.PAID,
        dueDate: new Date('2026-08-26T00:00:00.000Z')
      },
      {
        id: 'past-canceled',
        status: NegotiationPaymentStatus.CANCELED,
        dueDate: new Date('2026-08-26T00:00:00.000Z')
      }
    ] as NegotiationPayment[]
    const paymentRepository = {
      find: jest.fn().mockResolvedValue(payments),
      save: jest.fn()
    } as unknown as Repository<NegotiationPayment>
    const financialService = {
      findOwnedFinancial: jest.fn().mockResolvedValue({ id: 'financial-1' })
    } as unknown as NegotiationFinancialService
    const service = new NegotiationPaymentService(
      paymentRepository,
      financialService,
      {} as Repository<NegotiationAttachment>
    )

    const result = await service.findAll('user-1', 'negotiation-1')

    expect(result.map((payment) => payment.status)).toEqual([
      NegotiationPaymentStatus.PENDING,
      NegotiationPaymentStatus.PENDING,
      NegotiationPaymentStatus.PENDING,
      NegotiationPaymentStatus.PAID,
      NegotiationPaymentStatus.CANCELED
    ])
    expect(paymentRepository.save).not.toHaveBeenCalled()
  })

  it('rejects a proof attachment from another negotiation', async () => {
    const paymentRepository = {
      create: jest.fn(),
      save: jest.fn()
    } as unknown as Repository<NegotiationPayment>
    const financialService = {
      findOwnedFinancial: jest.fn().mockResolvedValue({ id: 'financial-1' })
    } as unknown as NegotiationFinancialService
    const attachmentRepository = {
      findOne: jest.fn().mockResolvedValue(null)
    } as unknown as Repository<NegotiationAttachment>
    const service = new NegotiationPaymentService(
      paymentRepository,
      financialService,
      attachmentRepository
    )
    const dto: CreateNegotiationPaymentDto = {
      amount: '100.00',
      paymentMethod: NegotiationPaymentMethod.PIX,
      dueDate: '2026-08-28',
      paidAt: null,
      status: NegotiationPaymentStatus.PENDING,
      proofAttachmentId: '38e9456e-f3cd-44b9-99d8-0f3ae3ccac08'
    }

    await expect(
      service.create('user-1', 'negotiation-1', dto)
    ).rejects.toThrow('Negotiation proof attachment not found')
    expect(attachmentRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: dto.proofAttachmentId,
        negotiationId: 'negotiation-1'
      },
      select: { id: true }
    })
    expect(paymentRepository.create).not.toHaveBeenCalled()
    expect(paymentRepository.save).not.toHaveBeenCalled()
  })
})

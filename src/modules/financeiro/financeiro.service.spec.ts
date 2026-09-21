import { Repository, SelectQueryBuilder } from 'typeorm'

import { Message } from '../leads/entities/message.entity'
import { NegotiationCost } from '../negotiation/entities/negotiation-cost.entity'
import { NegotiationFinancial } from '../negotiation/entities/negotiation-financial.entity'
import {
  NegotiationPayment,
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../negotiation/entities/negotiation-payment.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroService } from './financeiro.service'

const emptyRepository = <Entity>(): Repository<Entity> =>
  ({}) as Repository<Entity>

const createAggregateQueryBuilder = <Entity>(rawResult: object) =>
  ({
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawResult)
  }) as unknown as SelectQueryBuilder<Entity>

describe('FinanceiroService', () => {
  it('calculates template quantities and costs for the selected period', async () => {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { templateType: 'MARKETING', quantity: '3' },
        { templateType: 'UTILITY', quantity: '2' },
        { templateType: 'UNKNOWN', quantity: '1' }
      ])
    } as unknown as SelectQueryBuilder<Message>
    const messageRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
    } as unknown as Repository<Message>
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'information-1' }])
    } as unknown as Repository<UserInformations>
    const service = new FinanceiroService(
      messageRepository,
      emptyRepository<NegotiationFinancial>(),
      emptyRepository<NegotiationCost>(),
      emptyRepository<NegotiationPayment>(),
      userInformationsRepository
    )

    const result = await service.getTemplateCosts('user-1', {
      createdAtFrom: '2026-08-01',
      createdAtTo: '2026-08-15',
      leadId: 'lead-1'
    })

    expect(result).toEqual({
      totalTemplates: 6,
      totalCost: 0.98,
      types: [
        {
          type: 'MARKETING',
          label: 'Marketing',
          quantity: 3,
          unitCost: 0.3,
          totalCost: 0.9
        },
        {
          type: 'UTILITY',
          label: 'Utilitário',
          quantity: 2,
          unitCost: 0.04,
          totalCost: 0.08
        },
        {
          type: 'UNKNOWN',
          label: 'Não identificado',
          quantity: 1,
          unitCost: 0,
          totalCost: 0
        }
      ]
    })
    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'leads',
      'lead',
      'lead.id::text = message."leadId"'
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'message."leadId" = :leadId',
      { leadId: 'lead-1' }
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'message."createdAt" >= :createdAtFrom',
      { createdAtFrom: new Date('2026-08-01T00:00:00') }
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'message."createdAt" < :createdAtToExclusive',
      { createdAtToExclusive: new Date('2026-08-16T00:00:00') }
    )
  })

  it('calculates the top business summary for the selected period', async () => {
    const revenueQueryBuilder =
      createAggregateQueryBuilder<NegotiationFinancial>({
        grossRevenue: '94250.00',
        totalDiscounts: '9000.00'
      })
    const costsQueryBuilder = createAggregateQueryBuilder<NegotiationCost>({
      totalCosts: '22430.00'
    })
    const service = new FinanceiroService(
      emptyRepository<Message>(),
      {
        createQueryBuilder: jest.fn().mockReturnValue(revenueQueryBuilder)
      } as unknown as Repository<NegotiationFinancial>,
      {
        createQueryBuilder: jest.fn().mockReturnValue(costsQueryBuilder)
      } as unknown as Repository<NegotiationCost>,
      emptyRepository<NegotiationPayment>(),
      {
        find: jest.fn().mockResolvedValue([{ id: 'information-1' }])
      } as unknown as Repository<UserInformations>
    )

    const result = await service.getBusinessSummary('user-1', {
      createdAtFrom: '2026-08-01',
      createdAtTo: '2026-08-15'
    })

    expect(result).toEqual({
      netRevenue: 85250,
      totalCosts: 22430,
      netResult: 62820,
      profitMargin: (62820 / 85250) * 100
    })
    expect(revenueQueryBuilder.andWhere).toHaveBeenCalledWith(
      'negotiation."createdAt" >= :createdAtFrom',
      { createdAtFrom: new Date('2026-08-01T00:00:00') }
    )
    expect(costsQueryBuilder.andWhere).toHaveBeenCalledWith(
      'negotiation."createdAt" < :createdAtToExclusive',
      { createdAtToExclusive: new Date('2026-08-16T00:00:00') }
    )
  })

  it('calculates revenue for the selected period', async () => {
    const revenueQueryBuilder =
      createAggregateQueryBuilder<NegotiationFinancial>({
        grossRevenue: '94250.00',
        totalDiscounts: '9000.00'
      })
    const service = new FinanceiroService(
      emptyRepository<Message>(),
      {
        createQueryBuilder: jest.fn().mockReturnValue(revenueQueryBuilder)
      } as unknown as Repository<NegotiationFinancial>,
      emptyRepository<NegotiationCost>(),
      emptyRepository<NegotiationPayment>(),
      {
        find: jest.fn().mockResolvedValue([{ id: 'information-1' }])
      } as unknown as Repository<UserInformations>
    )

    await expect(
      service.getRevenue('user-1', {
        createdAtFrom: '2026-08-01',
        createdAtTo: '2026-08-15'
      })
    ).resolves.toEqual({
      grossRevenue: 94250,
      totalDiscounts: 9000,
      netRevenue: 85250
    })
  })

  it('calculates payment totals and quantities for the selected period', async () => {
    const paymentsQueryBuilder =
      createAggregateQueryBuilder<NegotiationPayment>({
        receivedAmount: '67050.00',
        receivedCount: '12',
        pendingAmount: '18200.00',
        pendingCount: '5',
        overdueAmount: '3200.00',
        overdueCount: '2'
      })
    const service = new FinanceiroService(
      emptyRepository<Message>(),
      emptyRepository<NegotiationFinancial>(),
      emptyRepository<NegotiationCost>(),
      {
        createQueryBuilder: jest.fn().mockReturnValue(paymentsQueryBuilder)
      } as unknown as Repository<NegotiationPayment>,
      {
        find: jest.fn().mockResolvedValue([{ id: 'information-1' }])
      } as unknown as Repository<UserInformations>
    )

    await expect(
      service.getPayments('user-1', {
        createdAtFrom: '2026-08-01',
        createdAtTo: '2026-08-15'
      })
    ).resolves.toEqual({
      receivedAmount: 67050,
      receivedCount: 12,
      pendingAmount: 18200,
      pendingCount: 5,
      overdueAmount: 3200,
      overdueCount: 2
    })
    expect(paymentsQueryBuilder.andWhere).toHaveBeenCalledWith(
      'negotiation."createdAt" < :createdAtToExclusive',
      { createdAtToExclusive: new Date('2026-08-16T00:00:00') }
    )
  })

  it('lists payments with installment positions', async () => {
    const paymentsQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'payment-1',
          leadId: 'lead-1',
          leadName: 'Maria',
          negotiationId: 'negotiation-1',
          negotiationTitle: 'Projeto anual',
          paymentMethod: NegotiationPaymentMethod.CREDIT_CARD,
          installmentNumber: '3',
          totalInstallments: '12',
          dueDate: '2026-09-20T00:00:00.000Z',
          amount: '250.50',
          status: NegotiationPaymentStatus.PENDING
        },
        {
          id: 'payment-2',
          leadId: 'lead-1',
          leadName: 'Maria',
          negotiationId: 'negotiation-1',
          negotiationTitle: 'Projeto anual',
          paymentMethod: NegotiationPaymentMethod.CREDIT_CARD,
          installmentNumber: '4',
          totalInstallments: '12',
          dueDate: '2026-10-20T00:00:00.000Z',
          amount: '250.50',
          status: NegotiationPaymentStatus.PENDING
        }
      ])
    } as unknown as SelectQueryBuilder<NegotiationPayment>
    const service = new FinanceiroService(
      emptyRepository<Message>(),
      emptyRepository<NegotiationFinancial>(),
      emptyRepository<NegotiationCost>(),
      {
        createQueryBuilder: jest.fn().mockReturnValue(paymentsQueryBuilder)
      } as unknown as Repository<NegotiationPayment>,
      {
        find: jest.fn().mockResolvedValue([{ id: 'information-1' }])
      } as unknown as Repository<UserInformations>
    )

    await expect(
      service.listPayments('user-1', {
        dueDateFrom: '2026-09-01',
        dueDateTo: '2026-09-30'
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'payment-1',
          leadId: 'lead-1',
          leadName: 'Maria',
          negotiationId: 'negotiation-1',
          negotiationTitle: 'Projeto anual',
          paymentMethod: NegotiationPaymentMethod.CREDIT_CARD,
          installmentNumber: 3,
          totalInstallments: 12,
          dueDate: new Date('2026-09-20T00:00:00.000Z'),
          amount: 250.5,
          status: NegotiationPaymentStatus.PENDING
        }
      ]
    })
  })
})

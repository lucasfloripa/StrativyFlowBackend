import { ConflictException, NotFoundException } from '@nestjs/common'
import { Repository, SelectQueryBuilder } from 'typeorm'

import { NegotiationFinancial } from '../entities/negotiation-financial.entity'
import { Negotiation } from '../entities/negotiation.entity'

import { NegotiationFinancialService } from './negotiation-financial.service'

const createOwnedNegotiationQuery = (negotiation: Negotiation | null) =>
  ({
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(negotiation)
  }) as unknown as SelectQueryBuilder<Negotiation>

describe('NegotiationFinancialService', () => {
  it('creates financial information only for an owned negotiation', async () => {
    const queryBuilder = createOwnedNegotiationQuery({
      id: 'negotiation-1'
    } as Negotiation)
    const negotiationRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
    } as unknown as Repository<Negotiation>
    const financial = {
      negotiationId: 'negotiation-1',
      saleAmount: '1500.00',
      discountAmount: null
    } as NegotiationFinancial
    const financialRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(financial),
      save: jest.fn().mockResolvedValue(financial)
    } as unknown as Repository<NegotiationFinancial>
    const service = new NegotiationFinancialService(
      negotiationRepository,
      financialRepository
    )

    await expect(
      service.create('user-1', 'negotiation-1', { saleAmount: '1500.00' })
    ).resolves.toBe(financial)
    expect(financialRepository.create).toHaveBeenCalledWith({
      negotiationId: 'negotiation-1',
      saleAmount: '1500.00',
      discountAmount: null
    })
  })

  it('rejects financial access when the negotiation is not owned', async () => {
    const negotiationRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createOwnedNegotiationQuery(null))
    } as unknown as Repository<Negotiation>
    const financialRepository = {
      findOne: jest.fn()
    } as unknown as Repository<NegotiationFinancial>
    const service = new NegotiationFinancialService(
      negotiationRepository,
      financialRepository
    )

    await expect(
      service.findOne('other-user', 'negotiation-1')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(financialRepository.findOne).not.toHaveBeenCalled()
  })

  it('rejects duplicate financial information', async () => {
    const negotiationRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(
          createOwnedNegotiationQuery({ id: 'negotiation-1' } as Negotiation)
        )
    } as unknown as Repository<Negotiation>
    const financialRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'financial-1' })
    } as unknown as Repository<NegotiationFinancial>
    const service = new NegotiationFinancialService(
      negotiationRepository,
      financialRepository
    )

    await expect(
      service.create('user-1', 'negotiation-1', { saleAmount: '1500.00' })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('removes owned financial information', async () => {
    const negotiationRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(
          createOwnedNegotiationQuery({ id: 'negotiation-1' } as Negotiation)
        )
    } as unknown as Repository<Negotiation>
    const financial = {
      id: 'financial-1',
      negotiationId: 'negotiation-1'
    } as NegotiationFinancial
    const financialRepository = {
      findOne: jest.fn().mockResolvedValue(financial),
      remove: jest.fn().mockResolvedValue(financial)
    } as unknown as Repository<NegotiationFinancial>
    const service = new NegotiationFinancialService(
      negotiationRepository,
      financialRepository
    )

    await expect(service.remove('user-1', 'negotiation-1')).resolves.toBe(
      financial
    )
    expect(financialRepository.remove).toHaveBeenCalledWith(financial)
  })
})

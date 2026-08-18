import { Repository, SelectQueryBuilder } from 'typeorm'

import { Message } from '../leads/entities/message.entity'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { FinanceiroService } from './financeiro.service'

describe('FinanceiroService template costs', () => {
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
      {} as Repository<Negotiation>,
      messageRepository,
      userInformationsRepository
    )

    const result = await service.getTemplateCosts('user-1', {
      createdAtFrom: '2026-08-01',
      createdAtTo: '2026-08-15'
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
      'message."createdAt" >= :createdAtFrom',
      { createdAtFrom: new Date('2026-08-01T00:00:00') }
    )
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'message."createdAt" < :createdAtToExclusive',
      { createdAtToExclusive: new Date('2026-08-16T00:00:00') }
    )
  })
})

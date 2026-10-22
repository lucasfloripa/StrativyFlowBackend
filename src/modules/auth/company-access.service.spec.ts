import { NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'

import { CompanyAccessService, CompanyResource } from './company-access.service'

describe('CompanyAccessService', () => {
  const setup = () => {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(true)
    }
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { companyId: 'company-1' },
          { companyId: 'company-1' },
          { companyId: null }
        ]),
      createQueryBuilder: jest.fn().mockReturnValue(query)
    }
    const dataSource = { getRepository: jest.fn().mockReturnValue(repository) }
    return {
      service: new CompanyAccessService(dataSource as unknown as DataSource),
      query,
      repository
    }
  }

  it.each<CompanyResource>([
    'lead',
    'message',
    'negotiation',
    'attachment',
    'followUp',
    'step',
    'cost',
    'payment'
  ])(
    'scopes %s access to Companies of the authenticated user',
    async (resource) => {
      const { service, query, repository } = setup()
      await service.assertResource('user-1', resource, 'resource-1')
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { companyId: true }
      })
      expect(query.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('"companyId" IN'),
        { companyIds: ['company-1'] }
      )
      expect(query.where).toHaveBeenCalledWith('resource.id = :resourceId', {
        resourceId: 'resource-1'
      })
    }
  )

  it('does not expose resources of another Company', async () => {
    const { service, query } = setup()
    query.getExists.mockResolvedValue(false)
    await expect(
      service.assertResource('user-1', 'negotiation', 'foreign-resource')
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('does not query resources without Company membership', async () => {
    const { service, query, repository } = setup()
    repository.find.mockResolvedValue([])
    await expect(
      service.assertResource('user-1', 'lead', 'resource')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(query.getExists).not.toHaveBeenCalled()
  })
})

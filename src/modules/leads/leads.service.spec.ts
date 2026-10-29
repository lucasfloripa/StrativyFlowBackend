import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common'
import { In, Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { OutboxService } from '../outbox/services/outbox.service'
import { StorageService } from '../storage/storage.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { CreateLeadDto } from './dtos/create-lead.dto'
import { Lead, LeadState } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadsService } from './leads.service'

describe('LeadsService create', () => {
  it('blocks a duplicate phone with an equivalent ninth digit variant', async () => {
    const transactionalLeadRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'existing-lead',
        phone: '554884296447'
      })
    }
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(transactionalLeadRepository)
    }
    const leadRepository = {
      manager: {
        transaction: jest.fn(
          async (operation: (transactionManager: typeof manager) => unknown) =>
            await operation(manager)
        )
      }
    } as unknown as Repository<Lead>
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([{ companyId: 'company-1' }])
    } as unknown as Repository<UserInformations>
    const rabbitPublisherService = {
      publish: jest.fn()
    } as unknown as OutboxService
    const service = new LeadsService(
      leadRepository,
      {} as Repository<Message>,
      {} as Repository<FollowUp>,
      userInformationsRepository,
      rabbitPublisherService,
      {} as StorageService
    )

    await expect(
      service.create('user-1', {
        name: 'Lead duplicado',
        phone: '5548984296447'
      })
    ).rejects.toThrow(ConflictException)

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['company-1:554884296447']
    )
    expect(transactionalLeadRepository.findOne).toHaveBeenCalledWith({
      where: [
        {
          companyId: 'company-1',
          phone: '5548984296447'
        },
        {
          companyId: 'company-1',
          phone: '554884296447'
        }
      ]
    })
    expect(rabbitPublisherService.publish).not.toHaveBeenCalled()
  })
})

describe('LeadsService company access', () => {
  const createService = () => {
    const transactionalLeadRepository = {
      findOne: jest.fn().mockResolvedValue(null)
    }
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(transactionalLeadRepository),
      create: jest.fn((_entity: typeof Lead, input: Partial<Lead>) =>
        Object.assign(new Lead(), input)
      ),
      save: jest.fn((_entity: typeof Lead, lead: Lead) =>
        Promise.resolve(Object.assign(lead, { id: 'created-lead' }))
      )
    }
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] })
    }
    const leadRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Partial<Lead>) =>
        Object.assign(new Lead(), input)
      ),
      save: jest.fn((lead: Lead) =>
        Promise.resolve(Object.assign(lead, { id: lead.id ?? 'created-lead' }))
      ),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        transaction: jest.fn(
          async (operation: (transactionManager: typeof manager) => unknown) =>
            await operation(manager)
        )
      }
    }
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]),
      findOne: jest.fn().mockResolvedValue({ companyId: 'company-1' })
    }
    const rabbitPublisher = {
      publish: jest
        .fn<Promise<void>, [string, Record<string, unknown>]>()
        .mockResolvedValue(undefined)
    }
    const service = new LeadsService(
      leadRepository as unknown as Repository<Lead>,
      {} as Repository<Message>,
      {} as Repository<FollowUp>,
      userInformationsRepository as unknown as Repository<UserInformations>,
      rabbitPublisher as unknown as OutboxService,
      {} as StorageService
    )

    return {
      service,
      leadRepository,
      userInformationsRepository,
      manager,
      transactionalLeadRepository,
      queryBuilder,
      rabbitPublisher
    }
  }

  it('creates a lead in the user company without binding it to user information', async () => {
    const dependencies = createService()
    const dto = Object.assign(new CreateLeadDto(), {
      name: 'Lead',
      phone: '5548984296447',
      userInformationsId: 'injected-mapping'
    })

    const created = await dependencies.service.create('user-1', dto)

    expect(created.companyId).toBe('company-1')
    expect(created.userInformationsId).toBeUndefined()
    expect(dependencies.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['company-1:554884296447']
    )
    expect(dependencies.rabbitPublisher.publish).toHaveBeenCalledWith(
      'lead.created',
      expect.objectContaining({ companyId: 'company-1', userId: 'user-1' })
    )
    expect(
      dependencies.rabbitPublisher.publish.mock.calls[0][1]
    ).not.toHaveProperty('userInformationsId')
  })

  it('ignores null memberships and deduplicates companies from multiple mappings', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      { companyId: null },
      { companyId: 'company-1' },
      { companyId: 'company-1' }
    ])

    const created = await dependencies.service.create('user-1', {
      phone: '5548984296447'
    })

    expect(created.companyId).toBe('company-1')
  })

  it('requires a company membership before creating a lead', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      { companyId: null }
    ])

    await expect(
      dependencies.service.create('user-1', { phone: '5548984296447' })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(
      dependencies.leadRepository.manager.transaction
    ).not.toHaveBeenCalled()
  })

  it('rejects an explicit company outside the authenticated user memberships', async () => {
    const dependencies = createService()

    await expect(
      dependencies.service.create('user-1', {
        phone: '5548984296447',
        companyId: 'company-other'
      })
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(
      dependencies.leadRepository.manager.transaction
    ).not.toHaveBeenCalled()
  })

  it('requires company selection when multiple companies are available', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      { companyId: 'company-1' },
      { companyId: 'company-2' }
    ])

    await expect(
      dependencies.service.create('user-1', { phone: '5548984296447' })
    ).rejects.toBeInstanceOf(BadRequestException)
    const created = await dependencies.service.create('user-1', {
      phone: '5548984296447',
      companyId: 'company-2'
    })
    expect(created.companyId).toBe('company-2')
  })

  it('lets different users from the same company access the same lead', async () => {
    const dependencies = createService()
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1',
      userInformationsId: 'another-user-mapping'
    })
    dependencies.leadRepository.findOne.mockResolvedValue(lead)

    await expect(
      dependencies.service.findOwnedLeadOrFail('user-1', lead.id)
    ).resolves.toBe(lead)
    await expect(
      dependencies.service.findOwnedLeadOrFail('user-2', lead.id)
    ).resolves.toBe(lead)
    expect(
      dependencies.userInformationsRepository.findOne
    ).toHaveBeenCalledWith({
      where: { userId: 'user-1', companyId: 'company-1' }
    })
    expect(
      dependencies.userInformationsRepository.findOne
    ).toHaveBeenCalledWith({
      where: { userId: 'user-2', companyId: 'company-1' }
    })
  })

  it('denies access to a lead from a different company', async () => {
    const dependencies = createService()
    dependencies.leadRepository.findOne.mockResolvedValue({
      id: 'lead-1',
      companyId: 'company-other'
    })
    dependencies.userInformationsRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.findOwnedLeadOrFail('user-1', 'lead-1')
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('does not fall back to the legacy mapping for a lead without company', async () => {
    const dependencies = createService()
    dependencies.leadRepository.findOne.mockResolvedValue({
      id: 'lead-1',
      userInformationsId: 'legacy-mapping'
    })

    await expect(
      dependencies.service.findOwnedLeadOrFail('user-1', 'lead-1')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(
      dependencies.userInformationsRepository.findOne
    ).not.toHaveBeenCalled()
  })

  it('returns not found for missing leads', async () => {
    const { service } = createService()

    await expect(
      service.findOwnedLeadOrFail('user-1', 'missing-lead')
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lists leads by company instead of the individual user information', async () => {
    const dependencies = createService()

    await expect(dependencies.service.listByUser('user-1')).resolves.toEqual([])
    expect(dependencies.leadRepository.find).toHaveBeenCalledWith({
      where: { companyId: In(['company-1']) },
      order: { createdAt: 'DESC' }
    })
  })

  it('searches only company leads and ignores attempted tenant filter overrides', async () => {
    const dependencies = createService()

    await dependencies.service.searchByUser('user-1', {
      name: 'Lead',
      companyId: 'company-other',
      userInformationsId: 'legacy'
    })

    expect(dependencies.queryBuilder.where).toHaveBeenCalledWith(
      'lead."companyId" IN (:...companyIds)',
      { companyIds: ['company-1'] }
    )
    expect(dependencies.queryBuilder.andWhere).toHaveBeenCalledTimes(1)
    expect(dependencies.queryBuilder.andWhere).toHaveBeenCalledWith(
      'lead.name ILIKE :name',
      { name: '%Lead%' }
    )
  })

  it('returns empty lists without querying leads when there is no company', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([])

    await expect(dependencies.service.listByUser('user-1')).resolves.toEqual([])
    await expect(
      dependencies.service.searchByUser('user-1', {})
    ).resolves.toEqual([])
    expect(dependencies.leadRepository.find).not.toHaveBeenCalled()
    expect(
      dependencies.leadRepository.createQueryBuilder
    ).not.toHaveBeenCalled()
  })

  it('upserts WhatsApp leads with a company-scoped lookup and event', async () => {
    const dependencies = createService()

    const created = await dependencies.service.upsertFromWhatsapp('user-1', {
      phone: '5548984296447'
    })

    expect(dependencies.leadRepository.findOne).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        phone: '5548984296447',
        state: LeadState.ACTIVE
      }
    })
    expect(created.companyId).toBe('company-1')
    expect(created.userInformationsId).toBeUndefined()
    expect(dependencies.rabbitPublisher.publish).toHaveBeenCalledWith(
      'lead.created',
      expect.objectContaining({ companyId: 'company-1' })
    )
  })

  it('updates an existing WhatsApp lead in the company without creating another', async () => {
    const dependencies = createService()
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1',
      phone: '5548984296447'
    })
    dependencies.leadRepository.findOne.mockResolvedValue(lead)

    const updated = await dependencies.service.upsertFromWhatsapp('user-2', {
      phone: lead.phone,
      name: 'Updated name'
    })

    expect(updated.id).toBe(lead.id)
    expect(updated.name).toBe('Updated name')
    expect(dependencies.leadRepository.create).not.toHaveBeenCalled()
    expect(dependencies.rabbitPublisher.publish).not.toHaveBeenCalled()
  })

  it('updates lead details without transferring company ownership', async () => {
    const dependencies = createService()
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1'
    })
    dependencies.leadRepository.findOne.mockResolvedValue(lead)

    const updated = await dependencies.service.update('user-1', lead.id, {
      name: 'Updated name'
    })

    expect(updated.name).toBe('Updated name')
    expect(updated.companyId).toBe('company-1')
  })
})

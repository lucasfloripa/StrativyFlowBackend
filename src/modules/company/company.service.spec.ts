import {
  BadRequestException,
  ConflictException,
  NotFoundException
} from '@nestjs/common'
import { In, IsNull, Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { Company } from './company.entity'
import { CompanyService } from './company.service'

describe('CompanyService', () => {
  const company = Object.assign(new Company(), {
    id: 'company-1',
    name: 'Acme',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z')
  })

  const createService = () => {
    const companyRepository = {
      create: jest.fn((input: Partial<Company>) =>
        Object.assign(new Company(), input)
      ),
      save: jest.fn((input: Company) =>
        Promise.resolve(
          Object.assign(input, { id: input.id ?? 'company-created' })
        )
      ),
      find: jest.fn(),
      remove: jest.fn((input: Company) => Promise.resolve(input))
    }
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        Object.assign(new UserInformations(), {
          id: 'user-info-1',
          userId: 'user-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        })
      ]),
      findOne: jest.fn(),
      count: jest.fn(),
      save: jest.fn((input: UserInformations) => Promise.resolve(input))
    }
    const service = new CompanyService(
      companyRepository as unknown as Repository<Company>,
      userInformationsRepository as unknown as Repository<UserInformations>
    )

    return { service, companyRepository, userInformationsRepository }
  }

  it('creates a company and links the first user information mapping', async () => {
    const dependencies = createService()

    const created = await dependencies.service.create('user-1', {
      name: '  Acme  '
    })

    expect(dependencies.companyRepository.create).toHaveBeenCalledWith({
      name: 'Acme',
      companyPhoneNumber: null,
      companyPhoneNumberId: null,
      whatsappToken: null,
      messengerPageId: null,
      messengerToken: null,
      instagramAccountId: null,
      instagramToken: null
    })
    expect(dependencies.userInformationsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-info-1',
        companyId: 'company-created'
      })
    )
    expect(created.id).toBe('company-created')
  })

  it('creates a company with every provided field', async () => {
    const dependencies = createService()

    const created = await dependencies.service.create('user-1', {
      name: 'Acme',
      companyPhoneNumber: '+5548999999999',
      companyPhoneNumberId: 'phone-id',
      whatsappToken: 'secret-token',
      messengerPageId: 'messenger-page-id',
      messengerToken: 'messenger-token',
      instagramAccountId: 'instagram-account-id',
      instagramToken: 'instagram-token'
    })

    expect(dependencies.companyRepository.create).toHaveBeenCalledWith({
      name: 'Acme',
      companyPhoneNumber: '+5548999999999',
      companyPhoneNumberId: 'phone-id',
      whatsappToken: 'secret-token',
      messengerPageId: 'messenger-page-id',
      messengerToken: 'messenger-token',
      instagramAccountId: 'instagram-account-id',
      instagramToken: 'instagram-token'
    })
    expect(created.whatsappToken).toBe('secret-token')
    expect(created.messengerPageId).toBe('messenger-page-id')
    expect(created.messengerToken).toBe('messenger-token')
    expect(created.instagramAccountId).toBe('instagram-account-id')
    expect(created.instagramToken).toBe('instagram-token')
  })

  it('updates and clears channel fields', async () => {
    const dependencies = createService()
    const editableCompany = Object.assign(new Company(), company, {
      companyPhoneNumber: '+5548999999999'
    })
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company: editableCompany
    })

    const updated = await dependencies.service.update(
      'user-1',
      editableCompany.id,
      {
        companyPhoneNumber: '  ',
        companyPhoneNumberId: 'id-2',
        whatsappToken: 'new',
        messengerPageId: '  ',
        messengerToken: 'messenger-token',
        instagramAccountId: 'instagram-account-id',
        instagramToken: 'instagram-token'
      }
    )

    expect(dependencies.companyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyPhoneNumber: null,
        companyPhoneNumberId: 'id-2',
        messengerPageId: null,
        messengerToken: 'messenger-token',
        instagramAccountId: 'instagram-account-id',
        instagramToken: 'instagram-token'
      })
    )
    expect(updated.companyPhoneNumber).toBeNull()
    expect(updated.whatsappToken).toBe('new')
    expect(updated.messengerPageId).toBeNull()
    expect(updated.messengerToken).toBe('messenger-token')
    expect(updated.instagramAccountId).toBe('instagram-account-id')
    expect(updated.instagramToken).toBe('instagram-token')
  })

  it('requires an unassigned account mapping to create a company', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([])

    await expect(
      dependencies.service.create('user-1', { name: 'Acme' })
    ).rejects.toBeInstanceOf(ConflictException)
    expect(dependencies.userInformationsRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', companyId: IsNull() },
      order: { createdAt: 'ASC' }
    })
  })

  it('lists unique companies linked to the authenticated user mappings', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      { id: 'user-info-1', company },
      { id: 'user-info-2', company }
    ])

    await expect(dependencies.service.findAll('user-1')).resolves.toEqual([
      company
    ])
    expect(dependencies.userInformationsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        relations: { company: true }
      })
    )
  })

  it('finds a company owned by the authenticated user', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company
    })

    await expect(
      dependencies.service.findOne('user-1', company.id)
    ).resolves.toBe(company)
  })

  it('does not expose a company owned by another user', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.findOne('user-2', company.id)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lists Company members without exposing their credentials', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company
    })
    dependencies.userInformationsRepository.find.mockResolvedValue([
      {
        id: 'user-info-1',
        name: 'Ana',
        email: 'ana@example.com',
        phoneNumber: '+5511999999999'
      }
    ])

    await expect(
      dependencies.service.findMembers('user-1', company.id)
    ).resolves.toEqual([
      {
        id: 'user-info-1',
        name: 'Ana',
        email: 'ana@example.com',
        phoneNumber: '+5511999999999'
      }
    ])
    expect(dependencies.userInformationsRepository.find).toHaveBeenCalledWith({
      where: { companyId: company.id },
      select: ['id', 'name', 'email', 'phoneNumber'],
      order: { createdAt: 'ASC' }
    })
  })

  it('links unassigned mappings by ID and treats existing members idempotently', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company
    })
    dependencies.userInformationsRepository.find.mockResolvedValue([
      {
        id: 'user-info-2',
        companyId: null,
        name: 'Bia',
        email: 'bia@example.com',
        phoneNumber: '+5511888888888'
      },
      {
        id: 'user-info-1',
        companyId: company.id,
        name: 'Ana',
        email: 'ana@example.com',
        phoneNumber: '+5511999999999'
      }
    ])

    await expect(
      dependencies.service.addMembers('user-1', company.id, {
        userInformationsIds: ['user-info-2', 'user-info-1', 'user-info-2']
      })
    ).resolves.toEqual([
      {
        id: 'user-info-2',
        name: 'Bia',
        email: 'bia@example.com',
        phoneNumber: '+5511888888888'
      },
      {
        id: 'user-info-1',
        name: 'Ana',
        email: 'ana@example.com',
        phoneNumber: '+5511999999999'
      }
    ])
    expect(dependencies.userInformationsRepository.find).toHaveBeenCalledWith({
      where: { id: In(['user-info-2', 'user-info-1']) }
    })
    expect(dependencies.userInformationsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'user-info-2',
        companyId: company.id
      })
    ])
  })

  it('does not move a mapping from another Company', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company
    })
    dependencies.userInformationsRepository.find.mockResolvedValue([
      { id: 'user-info-2', companyId: 'company-2' }
    ])

    await expect(
      dependencies.service.addMembers('user-1', company.id, {
        userInformationsIds: ['user-info-2']
      })
    ).rejects.toBeInstanceOf(ConflictException)
    expect(dependencies.userInformationsRepository.save).not.toHaveBeenCalled()
  })

  it('detaches a member but preserves the UserInformations record', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne
      .mockResolvedValueOnce({ id: 'user-info-1', company })
      .mockResolvedValueOnce({
        id: 'user-info-2',
        companyId: company.id
      })
    dependencies.userInformationsRepository.count.mockResolvedValue(2)

    await expect(
      dependencies.service.removeMember('user-1', company.id, 'user-info-2')
    ).resolves.toEqual({ success: true })
    expect(dependencies.userInformationsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-info-2', companyId: null })
    )
  })

  it('does not remove the last Company member', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne
      .mockResolvedValueOnce({ id: 'user-info-1', company })
      .mockResolvedValueOnce({ id: 'user-info-1', companyId: company.id })
    dependencies.userInformationsRepository.count.mockResolvedValue(1)

    await expect(
      dependencies.service.removeMember('user-1', company.id, 'user-info-1')
    ).rejects.toBeInstanceOf(ConflictException)
    expect(dependencies.userInformationsRepository.save).not.toHaveBeenCalled()
  })

  it('trims and updates the company name', async () => {
    const dependencies = createService()
    const editableCompany = Object.assign(new Company(), company)
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company: editableCompany
    })

    const updated = await dependencies.service.update(
      'user-1',
      editableCompany.id,
      { name: '  New name  ' }
    )

    expect(updated.name).toBe('New name')
    expect(dependencies.companyRepository.save).toHaveBeenCalledWith(
      editableCompany
    )
  })

  it('rejects an empty company name', async () => {
    const dependencies = createService()

    await expect(
      dependencies.service.create('user-1', { name: '   ' })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(dependencies.companyRepository.save).not.toHaveBeenCalled()
  })

  it('removes an owned company', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.findOne.mockResolvedValue({
      id: 'user-info-1',
      company
    })

    await expect(
      dependencies.service.remove('user-1', company.id)
    ).resolves.toBe(company)
    expect(dependencies.companyRepository.remove).toHaveBeenCalledWith(company)
  })
})

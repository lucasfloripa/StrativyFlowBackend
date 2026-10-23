import { Request } from 'express'

import { buildCompany } from '../../testing'

import { CompanyController } from './company.controller'
import { CompanyService } from './company.service'
import { toCompanyResponse } from './mappers/company-response.mapper'

describe('CompanyController', () => {
  const userRequest = {
    user: { id: 'user-1' }
  } as Request & { user: { id: string } }

  const createController = () => {
    const companyService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findMembers: jest.fn(),
      addMembers: jest.fn(),
      removeMember: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    }

    return {
      controller: new CompanyController(
        companyService as unknown as CompanyService
      ),
      companyService
    }
  }

  it('delegates create with the authenticated user and DTO', async () => {
    const { controller, companyService } = createController()
    const dto = { name: 'Acme' }
    const createdCompany = buildCompany({ name: 'Acme' })
    companyService.create.mockResolvedValue(createdCompany)

    await expect(controller.create(dto, userRequest)).resolves.toEqual(
      toCompanyResponse(createdCompany)
    )
    expect(companyService.create).toHaveBeenCalledWith('user-1', dto)
  })

  it('delegates list and get operations with the authenticated user', async () => {
    const { controller, companyService } = createController()
    const company = buildCompany()
    companyService.findAll.mockResolvedValue([company])
    companyService.findOne.mockResolvedValue(company)

    await expect(controller.findAll(userRequest)).resolves.toEqual([
      toCompanyResponse(company)
    ])
    await expect(controller.findOne('company-1', userRequest)).resolves.toEqual(
      toCompanyResponse(company)
    )
    expect(companyService.findAll).toHaveBeenCalledWith('user-1')
    expect(companyService.findOne).toHaveBeenCalledWith('user-1', 'company-1')
  })

  it('delegates Company member operations with the authenticated user', async () => {
    const { controller, companyService } = createController()
    const members = [{ id: 'user-info-2' }]
    const dto = { userInformationsIds: ['user-info-2'] }
    companyService.findMembers.mockResolvedValue(members)
    companyService.addMembers.mockResolvedValue(members)
    companyService.removeMember.mockResolvedValue({ success: true })

    await expect(
      controller.findMembers('company-1', userRequest)
    ).resolves.toBe(members)
    await expect(
      controller.addMembers('company-1', dto, userRequest)
    ).resolves.toBe(members)
    await expect(
      controller.removeMember('company-1', 'user-info-2', userRequest)
    ).resolves.toEqual({ success: true })
    expect(companyService.findMembers).toHaveBeenCalledWith(
      'user-1',
      'company-1'
    )
    expect(companyService.addMembers).toHaveBeenCalledWith(
      'user-1',
      'company-1',
      dto
    )
    expect(companyService.removeMember).toHaveBeenCalledWith(
      'user-1',
      'company-1',
      'user-info-2'
    )
  })

  it('never returns channel tokens from any Company endpoint', async () => {
    const { controller, companyService } = createController()
    const company = buildCompany({
      whatsappToken: 'whatsapp-secret',
      messengerToken: 'messenger-secret',
      instagramToken: 'instagram-secret'
    })
    companyService.create.mockResolvedValue(company)
    companyService.findAll.mockResolvedValue([company])
    companyService.findOne.mockResolvedValue(company)
    companyService.update.mockResolvedValue(company)
    companyService.remove.mockResolvedValue(company)

    const responses = await Promise.all([
      controller.create({ name: 'Acme' }, userRequest),
      controller.findAll(userRequest),
      controller.findOne('company-1', userRequest),
      controller.update('company-1', {}, userRequest),
      controller.remove('company-1', userRequest)
    ])

    expect(JSON.stringify(responses)).not.toContain('secret')
  })

  it('delegates update and delete operations with the authenticated user', async () => {
    const { controller, companyService } = createController()
    const dto = { name: 'New name' }
    const updatedCompany = buildCompany(dto)
    companyService.update.mockResolvedValue(updatedCompany)
    companyService.remove.mockResolvedValue(updatedCompany)

    await expect(
      controller.update('company-1', dto, userRequest)
    ).resolves.toEqual(toCompanyResponse(updatedCompany))
    await expect(controller.remove('company-1', userRequest)).resolves.toEqual(
      toCompanyResponse(updatedCompany)
    )
    expect(companyService.update).toHaveBeenCalledWith(
      'user-1',
      'company-1',
      dto
    )
    expect(companyService.remove).toHaveBeenCalledWith('user-1', 'company-1')
  })
})

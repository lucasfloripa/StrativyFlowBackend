import { Request } from 'express'

import { CompanyController } from './company.controller'
import { Company } from './company.entity'
import { CompanyService } from './company.service'

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
    const createdCompany = Object.assign(new Company(), { id: 'company-1' })
    companyService.create.mockResolvedValue(createdCompany)

    await expect(controller.create(dto, userRequest)).resolves.toBe(
      createdCompany
    )
    expect(companyService.create).toHaveBeenCalledWith('user-1', dto)
  })

  it('delegates list and get operations with the authenticated user', async () => {
    const { controller, companyService } = createController()
    companyService.findAll.mockResolvedValue([])
    companyService.findOne.mockResolvedValue({ id: 'company-1' })

    await expect(controller.findAll(userRequest)).resolves.toEqual([])
    await expect(controller.findOne('company-1', userRequest)).resolves.toEqual(
      { id: 'company-1' }
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

  it('delegates update and delete operations with the authenticated user', async () => {
    const { controller, companyService } = createController()
    const dto = { name: 'New name' }
    companyService.update.mockResolvedValue({ id: 'company-1', ...dto })
    companyService.remove.mockResolvedValue({ id: 'company-1' })

    await expect(
      controller.update('company-1', dto, userRequest)
    ).resolves.toEqual({ id: 'company-1', ...dto })
    await expect(controller.remove('company-1', userRequest)).resolves.toEqual({
      id: 'company-1'
    })
    expect(companyService.update).toHaveBeenCalledWith(
      'user-1',
      'company-1',
      dto
    )
    expect(companyService.remove).toHaveBeenCalledWith('user-1', 'company-1')
  })
})

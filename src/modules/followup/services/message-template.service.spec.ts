import { NotFoundException } from '@nestjs/common'
import { In, Repository } from 'typeorm'

import { CompanyAccessService } from '../../auth/company-access.service'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { Template } from '../entities/template.entity'

import { MessageTemplateService } from './message-template.service'

describe('MessageTemplateService', () => {
  const template = Object.assign(new Template(), {
    id: 'template-1',
    userInformationsId: 'mapping-1',
    metaTemplateName: 'welcome',
    metaTemplateId: null,
    language: 'pt_BR',
    category: 'UTILITY',
    active: true,
    name: 'Welcome',
    description: 'Hello',
    variables: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z')
  })

  const createService = () => {
    const messageTemplateRepository = {
      create: jest.fn((input: Partial<Template>) =>
        Object.assign(new Template(), input)
      ),
      save: jest.fn((input: Template) =>
        Promise.resolve(Object.assign(input, { id: input.id ?? template.id }))
      ),
      find: jest.fn().mockResolvedValue([template]),
      findOne: jest.fn().mockResolvedValue(template),
      remove: jest.fn((input: Template) => Promise.resolve(input))
    }
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        Object.assign(new UserInformations(), {
          id: 'mapping-1',
          companyId: 'company-1'
        }),
        Object.assign(new UserInformations(), {
          id: 'mapping-2',
          companyId: 'company-1'
        })
      ])
    }
    const companyAccessService = {
      companyIdsForUser: jest.fn().mockResolvedValue(['company-1'])
    }
    const service = new MessageTemplateService(
      messageTemplateRepository as unknown as Repository<Template>,
      userInformationsRepository as unknown as Repository<UserInformations>,
      companyAccessService as unknown as CompanyAccessService
    )

    return {
      service,
      messageTemplateRepository,
      userInformationsRepository,
      companyAccessService
    }
  }

  it('lists templates attached to any mapping in the authenticated company', async () => {
    const dependencies = createService()

    await expect(dependencies.service.findAll('user-1')).resolves.toEqual([
      expect.objectContaining({ id: template.id })
    ])
    expect(dependencies.userInformationsRepository.find).toHaveBeenCalledWith({
      where: { companyId: In(['company-1']) },
      select: ['id', 'companyId'],
      order: { createdAt: 'ASC' }
    })
    expect(dependencies.messageTemplateRepository.find).toHaveBeenCalledWith({
      where: { userInformationsId: In(['mapping-1', 'mapping-2']) },
      order: { createdAt: 'DESC' }
    })
  })

  it('does not return a template attached to another company', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      Object.assign(new UserInformations(), {
        id: 'other-mapping',
        companyId: 'company-1'
      })
    ])
    dependencies.messageTemplateRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.findOne(template.id, 'user-1')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(dependencies.messageTemplateRepository.findOne).toHaveBeenCalledWith(
      {
        where: {
          id: template.id,
          userInformationsId: In(['other-mapping'])
        }
      }
    )
  })

  it('rejects creating a template against a mapping outside the company', async () => {
    const dependencies = createService()

    await expect(
      dependencies.service.create(
        {
          userInformationsId: 'other-company-mapping',
          metaTemplateName: 'welcome',
          variables: []
        },
        'user-1'
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(dependencies.messageTemplateRepository.create).not.toHaveBeenCalled()
  })
})

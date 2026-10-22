import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { CompanyAccessService } from '../../auth/company-access.service'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { CreateMessageTemplateDto } from '../dto/create-message-template.dto'
import { MessageTemplateResponseDto } from '../dto/message-template-response.dto'
import { UpdateMessageTemplateDto } from '../dto/update-message-template.dto'
import { Template } from '../entities/template.entity'
import { mapMessageTemplateToResponseDto } from '../mappers/message-template-response.mapper'

@Injectable()
export class MessageTemplateService {
  constructor(
    @InjectRepository(Template)
    private readonly messageTemplateRepository: Repository<Template>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>,
    private readonly companyAccessService: CompanyAccessService
  ) {}

  async create(
    dto: CreateMessageTemplateDto,
    userId: string
  ): Promise<MessageTemplateResponseDto> {
    const mappings = await this.findCompanyUserInformations(userId)
    const userInformations = mappings.find(
      (mapping) => mapping.id === dto.userInformationsId
    )
    if (!userInformations) {
      throw new NotFoundException(
        `UserInformations ${dto.userInformationsId} not found`
      )
    }

    const template = this.messageTemplateRepository.create({
      userInformationsId: userInformations.id,
      userInformations,
      name: dto.name ?? dto.metaTemplateName,
      metaTemplateName: dto.metaTemplateName,
      metaTemplateId: dto.metaTemplateId ?? null,
      language: dto.language ?? 'pt_BR',
      category: dto.category ?? null,
      active: dto.active ?? true,
      description: dto.description ?? null,
      variables: dto.variables
    })

    const savedTemplate = await this.messageTemplateRepository.save(template)
    const reloadedTemplate = await this.findEntityById(savedTemplate.id, userId)

    return mapMessageTemplateToResponseDto(reloadedTemplate)
  }

  async findAll(userId: string): Promise<MessageTemplateResponseDto[]> {
    const userInformationsIds = await this.findCompanyUserInformationIds(userId)
    if (!userInformationsIds.length) {
      return []
    }

    const templates = await this.messageTemplateRepository.find({
      where: { userInformationsId: In(userInformationsIds) },
      order: { createdAt: 'DESC' }
    })

    return templates.map(mapMessageTemplateToResponseDto)
  }

  async findOne(
    id: string,
    userId: string
  ): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id, userId)

    return mapMessageTemplateToResponseDto(template)
  }

  async update(
    id: string,
    dto: UpdateMessageTemplateDto,
    userId: string
  ): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id, userId)

    if (dto.userInformationsId !== undefined) {
      const mappings = await this.findCompanyUserInformations(userId)
      const userInformations = mappings.find(
        (mapping) => mapping.id === dto.userInformationsId
      )
      if (!userInformations) {
        throw new NotFoundException(
          `UserInformations ${dto.userInformationsId} not found`
        )
      }

      template.userInformationsId = userInformations.id
      template.userInformations = userInformations
    }

    if (dto.metaTemplateName !== undefined) {
      template.metaTemplateName = dto.metaTemplateName
    }

    if (dto.name !== undefined) {
      template.name = dto.name
    }

    if (dto.description !== undefined) {
      template.description = dto.description ?? null
    }

    if (dto.metaTemplateId !== undefined) {
      template.metaTemplateId = dto.metaTemplateId ?? null
    }

    if (dto.language !== undefined) {
      template.language = dto.language
    }

    if (dto.category !== undefined) {
      template.category = dto.category ?? null
    }

    if (dto.active !== undefined) {
      template.active = dto.active
    }

    if (dto.variables !== undefined) {
      template.variables = dto.variables
    }

    const savedTemplate = await this.messageTemplateRepository.save(template)
    const reloadedTemplate = await this.findEntityById(savedTemplate.id, userId)

    return mapMessageTemplateToResponseDto(reloadedTemplate)
  }

  async remove(
    id: string,
    userId: string
  ): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id, userId)

    await this.messageTemplateRepository.remove(template)

    return mapMessageTemplateToResponseDto(template)
  }

  private async findEntityById(id: string, userId: string): Promise<Template> {
    const userInformationsIds = await this.findCompanyUserInformationIds(userId)
    if (!userInformationsIds.length) {
      throw new NotFoundException(`MessageTemplate ${id} not found`)
    }

    const template = await this.messageTemplateRepository.findOne({
      where: { id, userInformationsId: In(userInformationsIds) }
    })

    if (!template) {
      throw new NotFoundException(`MessageTemplate ${id} not found`)
    }

    return template
  }

  private async findCompanyUserInformations(
    userId: string
  ): Promise<UserInformations[]> {
    const companyIds = await this.companyAccessService.companyIdsForUser(userId)
    if (!companyIds.length) {
      return []
    }

    return await this.userInformationsRepository.find({
      where: { companyId: In(companyIds) },
      select: ['id', 'companyId'],
      order: { createdAt: 'ASC' }
    })
  }

  private async findCompanyUserInformationIds(
    userId: string
  ): Promise<string[]> {
    const mappings = await this.findCompanyUserInformations(userId)
    return [...new Set(mappings.map((mapping) => mapping.id))]
  }
}

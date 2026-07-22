import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateMessageTemplateDto } from '../dto/create-message-template.dto'
import { MessageTemplateResponseDto } from '../dto/message-template-response.dto'
import { UpdateMessageTemplateDto } from '../dto/update-message-template.dto'
import { Template } from '../entities/template.entity'
import { mapMessageTemplateToResponseDto } from '../mappers/message-template-response.mapper'
import { UserInformations } from '../../user/entities/user-informations.entity'

@Injectable()
export class MessageTemplateService {
  constructor(
    @InjectRepository(Template)
    private readonly messageTemplateRepository: Repository<Template>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>
  ) {}

  async create(
    dto: CreateMessageTemplateDto
  ): Promise<MessageTemplateResponseDto> {
    const userInformations = await this.findUserInformationsById(
      dto.userInformationsId
    )

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
    const reloadedTemplate = await this.findEntityById(savedTemplate.id)

    return mapMessageTemplateToResponseDto(reloadedTemplate)
  }

  async findAll(): Promise<MessageTemplateResponseDto[]> {
    const templates = await this.messageTemplateRepository.find({
      order: { createdAt: 'DESC' }
    })

    return templates.map(mapMessageTemplateToResponseDto)
  }

  async findOne(id: string): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id)

    return mapMessageTemplateToResponseDto(template)
  }

  async update(
    id: string,
    dto: UpdateMessageTemplateDto
  ): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id)

    if (dto.userInformationsId !== undefined) {
      const userInformations = await this.findUserInformationsById(
        dto.userInformationsId
      )

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
    const reloadedTemplate = await this.findEntityById(savedTemplate.id)

    return mapMessageTemplateToResponseDto(reloadedTemplate)
  }

  async remove(id: string): Promise<MessageTemplateResponseDto> {
    const template = await this.findEntityById(id)

    await this.messageTemplateRepository.remove(template)

    return mapMessageTemplateToResponseDto(template)
  }

  private async findEntityById(id: string): Promise<Template> {
    const template = await this.messageTemplateRepository.findOne({
      where: { id }
    })

    if (!template) {
      throw new NotFoundException(`MessageTemplate ${id} not found`)
    }

    return template
  }

  private async findUserInformationsById(
    id: string
  ): Promise<UserInformations> {
    const userInformations = await this.userInformationsRepository.findOne({
      where: { id }
    })

    if (!userInformations) {
      throw new NotFoundException(`UserInformations ${id} not found`)
    }

    return userInformations
  }
}
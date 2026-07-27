import { MessageTemplateResponseDto } from '../dto/message-template-response.dto'
import { Template } from '../entities/template.entity'

export const mapMessageTemplateToResponseDto = (
  template: Template
): MessageTemplateResponseDto => ({
  id: template.id,
  userInformationsId: template.userInformationsId ?? null,
  metaTemplateName: template.metaTemplateName,
  metaTemplateId: template.metaTemplateId ?? null,
  language: template.language,
  category: template.category ?? null,
  active: template.active,
  name: template.name,
  description: template.description ?? null,
  variables: template.variables ?? [],
  createdAt: template.createdAt.toISOString(),
  updatedAt: template.updatedAt.toISOString()
})

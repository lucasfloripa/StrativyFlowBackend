import { TemplateVariableDefinition } from '../entities/template.entity'

export type SendWhatsAppTemplateCommand = {
  followUpId: string
  negotiationId: string
  leadId: string
  templateId: string
  phone: string
  phoneNumberId: string
  accessToken: string
  metaTemplateName: string
  language: string
  templateVariableDefinitions: TemplateVariableDefinition[]
  variables: Record<string, unknown>
}

import { MetaWhatsAppTemplateParameterDto } from './meta-whatsapp-template-parameter.dto'

export type MetaWhatsAppTemplateComponentType = 'header' | 'body' | 'button'

export type MetaWhatsAppTemplateButtonSubType = 'quick_reply' | 'url'

export type MetaWhatsAppTemplateComponentDto = {
  type: MetaWhatsAppTemplateComponentType
  sub_type?: MetaWhatsAppTemplateButtonSubType
  index?: string
  parameters?: MetaWhatsAppTemplateParameterDto[]
}

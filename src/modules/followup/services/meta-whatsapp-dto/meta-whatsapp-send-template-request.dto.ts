import { MetaWhatsAppTemplateComponentDto } from './meta-whatsapp-template-component.dto'

export type MetaWhatsAppTemplateLanguageDto = {
  code: string
}

export type MetaWhatsAppTemplatePayloadDto = {
  name: string
  language: MetaWhatsAppTemplateLanguageDto
  components?: MetaWhatsAppTemplateComponentDto[]
}

export type MetaWhatsAppSendTemplateRequestDto = {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: MetaWhatsAppTemplatePayloadDto
}

export type MetaWhatsAppTemplateParameterType =
  | 'text'
  | 'currency'
  | 'date_time'
  | 'image'
  | 'document'
  | 'video'

export type MetaWhatsAppTemplateCurrencyParameter = {
  fallback_value: string
  code: string
  amount_1000: number
}

export type MetaWhatsAppTemplateDateTimeParameter = {
  fallback_value: string
}

export type MetaWhatsAppTemplateMediaParameter = {
  link?: string
  id?: string
}

export type MetaWhatsAppTemplateParameterDto = {
  type: MetaWhatsAppTemplateParameterType
  parameter_name?: string
  text?: string
  currency?: MetaWhatsAppTemplateCurrencyParameter
  date_time?: MetaWhatsAppTemplateDateTimeParameter
  image?: MetaWhatsAppTemplateMediaParameter
  document?: MetaWhatsAppTemplateMediaParameter
  video?: MetaWhatsAppTemplateMediaParameter
}

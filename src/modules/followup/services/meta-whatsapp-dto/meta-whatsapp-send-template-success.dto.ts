export type MetaWhatsAppSendTemplateContactDto = {
  input: string
  wa_id: string
}

export type MetaWhatsAppSendTemplateMessageDto = {
  id: string
  message_status?: string
}

export type MetaWhatsAppSendTemplateSuccessDto = {
  messaging_product?: string
  contacts?: MetaWhatsAppSendTemplateContactDto[]
  messages?: MetaWhatsAppSendTemplateMessageDto[]
}

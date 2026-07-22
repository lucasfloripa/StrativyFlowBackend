export type MetaWhatsAppErrorDataDto = {
  messaging_product?: string
  details?: string
}

export type MetaWhatsAppErrorDto = {
  message: string
  type: string
  code: number
  error_subcode?: number
  fbtrace_id?: string
  error_data?: MetaWhatsAppErrorDataDto
}

export type MetaWhatsAppErrorResponseDto = {
  error: MetaWhatsAppErrorDto
}

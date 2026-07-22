export type MetaWhatsAppApiConfig = {
  baseUrl: string
  phoneNumberId: string
  accessToken: string
}

export const buildMetaWhatsAppBaseUrl = (apiVersion: string): string => {
  return `https://graph.facebook.com/${apiVersion}`
}

/**
 * Public shape of a Company. Channel tokens are never returned; the
 * `has*Token` flags tell the client whether each channel is configured.
 */
export type CompanyResponseDto = {
  id: string
  name: string
  companyPhoneNumber: string | null
  companyPhoneNumberId: string | null
  messengerPageId: string | null
  instagramAccountId: string | null
  hasWhatsappToken: boolean
  hasMessengerToken: boolean
  hasInstagramToken: boolean
  createdAt: Date
  updatedAt: Date
}

import { Company } from '../company.entity'
import { CompanyResponseDto } from '../dto/company-response.dto'

const isConfigured = (token?: string | null): boolean => Boolean(token?.trim())

export function toCompanyResponse(company: Company): CompanyResponseDto {
  return {
    id: company.id,
    name: company.name,
    companyPhoneNumber: company.companyPhoneNumber ?? null,
    companyPhoneNumberId: company.companyPhoneNumberId ?? null,
    messengerPageId: company.messengerPageId ?? null,
    instagramAccountId: company.instagramAccountId ?? null,
    hasWhatsappToken: isConfigured(company.whatsappToken),
    hasMessengerToken: isConfigured(company.messengerToken),
    hasInstagramToken: isConfigured(company.instagramToken),
    createdAt: company.createdAt,
    updatedAt: company.updatedAt
  }
}

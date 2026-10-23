import { buildCompany, FIXED_DATE, FIXTURE_IDS } from '../../../testing'

import { toCompanyResponse } from './company-response.mapper'

describe('toCompanyResponse', () => {
  it('exposes channel ids and token presence flags without the tokens', () => {
    const company = buildCompany({
      companyPhoneNumber: '5548999999999',
      companyPhoneNumberId: 'phone-number-id',
      whatsappToken: 'whatsapp-secret',
      messengerPageId: 'page-id',
      messengerToken: 'messenger-secret',
      instagramAccountId: 'instagram-account-id',
      instagramToken: 'instagram-secret'
    })

    expect(toCompanyResponse(company)).toEqual({
      id: FIXTURE_IDS.company,
      name: 'Empresa Teste',
      companyPhoneNumber: '5548999999999',
      companyPhoneNumberId: 'phone-number-id',
      messengerPageId: 'page-id',
      instagramAccountId: 'instagram-account-id',
      hasWhatsappToken: true,
      hasMessengerToken: true,
      hasInstagramToken: true,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE
    })
  })

  it('reports missing or blank tokens as not configured', () => {
    const company = buildCompany({
      whatsappToken: null,
      messengerToken: '   ',
      instagramToken: undefined
    })

    expect(toCompanyResponse(company)).toMatchObject({
      hasWhatsappToken: false,
      hasMessengerToken: false,
      hasInstagramToken: false
    })
  })

  it('never serializes a token value', () => {
    const company = buildCompany({
      whatsappToken: 'whatsapp-secret',
      messengerToken: 'messenger-secret',
      instagramToken: 'instagram-secret'
    })

    const serialized = JSON.stringify(toCompanyResponse(company))

    expect(serialized).not.toContain('secret')
  })
})

import {
  buildCompany,
  buildUserInformations,
  FIXED_DATE,
  FIXTURE_IDS
} from '../../../testing'

import { toUserInformationsResponse } from './user-informations-response.mapper'

describe('toUserInformationsResponse', () => {
  it('returns only the whitelisted profile and notification fields', () => {
    const userInformations = buildUserInformations({
      notificationWhatsAppNumbers: ['5548999990002'],
      notificationEmails: ['avisos@teste.com'],
      notificationPreferences: {},
      messageShortcuts: { oi: 'Olá, tudo bem?' },
      company: buildCompany({ name: 'Acme' })
    })

    expect(toUserInformationsResponse(userInformations)).toEqual({
      id: FIXTURE_IDS.userInformations,
      userId: FIXTURE_IDS.user,
      companyId: FIXTURE_IDS.company,
      companyName: 'Acme',
      name: 'Usuário Teste',
      email: 'usuario@teste.com',
      phoneNumber: '5548999990001',
      notificationWhatsAppNumbers: ['5548999990002'],
      notificationEmails: ['avisos@teste.com'],
      notificationPreferences: {},
      messageShortcuts: { oi: 'Olá, tudo bem?' },
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE
    })
  })

  it('returns a null company name when the user has no company', () => {
    const userInformations = buildUserInformations({
      companyId: null,
      company: null
    })

    expect(toUserInformationsResponse(userInformations)).toMatchObject({
      companyId: null,
      companyName: null
    })
  })

  it('never serializes channel tokens from the user or the company', () => {
    const userInformations = buildUserInformations({
      whatsappToken: 'user-whatsapp-secret',
      messengerToken: 'user-messenger-secret',
      instagramToken: 'user-instagram-secret',
      company: buildCompany({ whatsappToken: 'company-whatsapp-secret' })
    })

    const serialized = JSON.stringify(
      toUserInformationsResponse(userInformations)
    )

    expect(serialized).not.toContain('secret')
  })
})

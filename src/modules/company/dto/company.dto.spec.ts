import { validate } from 'class-validator'

import { CreateCompanyDto } from './create-company.dto'
import { UpdateCompanyDto } from './update-company.dto'

describe('Company DTOs', () => {
  it('requires a non-empty string name when creating a company', async () => {
    const validDto = Object.assign(new CreateCompanyDto(), {
      name: 'Acme'
    })
    const invalidDto = Object.assign(new CreateCompanyDto(), {
      name: ''
    })

    await expect(validate(validDto)).resolves.toHaveLength(0)
    await expect(validate(invalidDto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })])
    )
  })

  it('allows an empty update and validates a provided name', async () => {
    await expect(validate(new UpdateCompanyDto())).resolves.toHaveLength(0)

    const invalidDto = Object.assign(new UpdateCompanyDto(), {
      name: 42
    })
    await expect(validate(invalidDto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })])
    )
  })

  it('accepts optional WhatsApp fields as strings, null, or omitted', async () => {
    const withValues = Object.assign(new CreateCompanyDto(), {
      name: 'Acme',
      companyPhoneNumber: '+5548999999999',
      companyPhoneNumberId: 'phone-id',
      whatsappToken: 'token',
      messengerPageId: 'messenger-page-id',
      messengerToken: 'messenger-token',
      instagramAccountId: 'instagram-account-id',
      instagramToken: 'instagram-token'
    })
    const withNulls = Object.assign(new UpdateCompanyDto(), {
      companyPhoneNumber: null,
      companyPhoneNumberId: null,
      whatsappToken: null,
      messengerPageId: null,
      messengerToken: null,
      instagramAccountId: null,
      instagramToken: null
    })

    await expect(validate(withValues)).resolves.toHaveLength(0)
    await expect(validate(withNulls)).resolves.toHaveLength(0)
  })

  it('rejects non-string WhatsApp fields', async () => {
    const invalidDto = Object.assign(new UpdateCompanyDto(), {
      companyPhoneNumber: 123,
      companyPhoneNumberId: true,
      whatsappToken: {},
      messengerPageId: 1,
      messengerToken: false,
      instagramAccountId: {},
      instagramToken: 2
    })

    const errors = await validate(invalidDto)

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'companyPhoneNumber',
        'companyPhoneNumberId',
        'whatsappToken',
        'messengerPageId',
        'messengerToken',
        'instagramAccountId',
        'instagramToken'
      ])
    )
  })
})

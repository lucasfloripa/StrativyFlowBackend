import { validate } from 'class-validator'

import { CreateLeadDto } from './create-lead.dto'

describe('CreateLeadDto', () => {
  it('requires a complete Brazilian phone', async () => {
    const missingPhoneDto = Object.assign(new CreateLeadDto(), {
      name: 'Lead'
    })
    const invalidPhoneDto = Object.assign(new CreateLeadDto(), {
      name: 'Lead',
      phone: '55489999'
    })

    const [missingPhoneErrors, invalidPhoneErrors] = await Promise.all([
      validate(missingPhoneDto),
      validate(invalidPhoneDto)
    ])

    expect(missingPhoneErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'phone' })])
    )
    expect(invalidPhoneErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'phone' })])
    )
  })

  it.each(['messenger', 'MESSENGER', 'direct', ' Direct '])(
    'rejects %s as a manual lead source',
    async (source) => {
      const dto = Object.assign(new CreateLeadDto(), {
        name: 'Lead',
        phone: '5548999999999',
        source
      })

      const errors = await validate(dto)

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'source' })
        ])
      )
    }
  )

  it('accepts Meta Ads as a manual lead source', async () => {
    const dto = Object.assign(new CreateLeadDto(), {
      name: 'Lead',
      phone: '5548999999999',
      source: 'Meta Ads'
    })

    await expect(validate(dto)).resolves.toEqual([])
  })
})

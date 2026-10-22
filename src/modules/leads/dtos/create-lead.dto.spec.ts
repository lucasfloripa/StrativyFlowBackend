import { validate } from 'class-validator'

import { CreateLeadDto } from './create-lead.dto'
import { UpdateLeadDto } from './update-lead.dto'

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

  it('accepts an optional UUID company selection on creation', async () => {
    const dto = Object.assign(new CreateLeadDto(), {
      phone: '5548999999999',
      companyId: '2fb85c67-d037-416b-8515-432a08b8f161'
    })

    await expect(validate(dto)).resolves.toEqual([])
    delete dto.companyId
    await expect(validate(dto)).resolves.toEqual([])
  })

  it.each([null, '', 'invalid-company', 12])(
    'rejects invalid company selection %s',
    async (companyId) => {
      const dto = Object.assign(new CreateLeadDto(), {
        phone: '5548999999999',
        companyId
      })

      const errors = await validate(dto)

      expect(errors.map((error) => error.property)).toContain('companyId')
    }
  )

  it('rejects company reassignment through the update DTO', async () => {
    const dto = Object.assign(new UpdateLeadDto(), {
      companyId: '2fb85c67-d037-416b-8515-432a08b8f161'
    })
    const errors = await validate(dto)

    expect(errors.map((error) => error.property)).toContain('companyId')
    await expect(validate(new UpdateLeadDto())).resolves.toEqual([])
  })
})

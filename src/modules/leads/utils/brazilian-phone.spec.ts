import {
  buildBrazilianPhoneVariants,
  toCanonicalBrazilianPhone
} from './brazilian-phone'

describe('Brazilian phone variants', () => {
  it('treats local numbers with eight or nine digits as the same phone', () => {
    expect(buildBrazilianPhoneVariants('554884296447')).toEqual([
      '554884296447',
      '5548984296447'
    ])
    expect(buildBrazilianPhoneVariants('5548984296447')).toEqual([
      '5548984296447',
      '554884296447'
    ])
    expect(toCanonicalBrazilianPhone('554884296447')).toBe('554884296447')
    expect(toCanonicalBrazilianPhone('5548984296447')).toBe('554884296447')
  })
})

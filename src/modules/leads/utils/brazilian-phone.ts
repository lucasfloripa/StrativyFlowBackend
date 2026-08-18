export const buildBrazilianPhoneVariants = (phone: string): string[] => {
  const digits = phone.replace(/\D/g, '')
  const variants = new Set<string>([digits])

  if (digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`)
  }

  if (digits.length === 13 && digits[4] === '9') {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`)
  }

  return Array.from(variants)
}

export const toCanonicalBrazilianPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')

  return digits.length === 13 && digits[4] === '9'
    ? `${digits.slice(0, 4)}${digits.slice(5)}`
    : digits
}

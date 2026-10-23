import { parseTrustProxyHops } from './trust-proxy'

describe('parseTrustProxyHops', () => {
  it.each([
    ['1', 1],
    [' 2 ', 2]
  ])('reads %p as %p proxy hops', (rawValue, expected) => {
    expect(parseTrustProxyHops(rawValue)).toBe(expected)
  })

  it.each([undefined, '', '0', '-1', '1.5', 'true', 'loopback'])(
    'ignores %p so forwarded headers are not trusted',
    (rawValue) => {
      expect(parseTrustProxyHops(rawValue)).toBeUndefined()
    }
  )
})

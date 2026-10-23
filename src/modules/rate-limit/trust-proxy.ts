/**
 * Number of reverse proxies in front of the API (TRUST_PROXY), so Express
 * reads the client IP from X-Forwarded-For. Unset or invalid means none: the
 * socket address is used and a forged X-Forwarded-For header is ignored.
 */
export const parseTrustProxyHops = (
  rawValue: string | undefined
): number | undefined => {
  const hops = Number(rawValue?.trim())

  return rawValue?.trim() && Number.isInteger(hops) && hops > 0
    ? hops
    : undefined
}

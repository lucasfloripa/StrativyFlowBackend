const META_MEDIA_HOST_SUFFIXES = [
  'fbcdn.net',
  'fbsbx.com',
  'cdninstagram.com'
] as const

/**
 * Returns true only for https URLs served by Meta's media CDNs. Inbound
 * Messenger and Instagram attachments carry a URL in the webhook body, and
 * the server downloads it, so any other host is refused to prevent SSRF.
 */
export function isAllowedMetaMediaUrl(rawUrl: string): boolean {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    return false
  }

  if (url.port && url.port !== '443') {
    return false
  }

  const host = url.hostname.toLowerCase()

  return META_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  )
}

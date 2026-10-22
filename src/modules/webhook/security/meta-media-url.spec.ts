import { isAllowedMetaMediaUrl } from './meta-media-url'

describe('isAllowedMetaMediaUrl', () => {
  it.each([
    'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1',
    'https://scontent.xx.fbcdn.net/v/t1.15752-9/audio.mp4',
    'https://scontent-gru2-1.cdninstagram.com/v/image.jpg',
    'https://LOOKASIDE.FBSBX.COM/whatsapp_business/attachments/?mid=1'
  ])('accepts the Meta CDN url %s', (url) => {
    expect(isAllowedMetaMediaUrl(url)).toBe(true)
  })

  it.each([
    ['plain http', 'http://scontent.xx.fbcdn.net/audio.mp4'],
    ['another domain', 'https://cdn.example.com/audio.mp4'],
    ['a look-alike suffix', 'https://scontent.fbcdn.net.evil.com/audio.mp4'],
    ['a look-alike prefix', 'https://evilfbcdn.net/audio.mp4'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/admin'],
    ['embedded credentials', 'https://user:pass@lookaside.fbsbx.com/file'],
    ['a non-default port', 'https://lookaside.fbsbx.com:8443/file'],
    ['an invalid url', 'not a url']
  ])('rejects %s', (_case, url) => {
    expect(isAllowedMetaMediaUrl(url)).toBe(false)
  })
})

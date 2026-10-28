import { resolveMediaFileExtension } from './media-file-extension'

describe('resolveMediaFileExtension', () => {
  it.each([
    ['audio/ogg; codecs=opus', 'ogg'],
    ['image/jpeg', 'jpg'],
    [' IMAGE/PNG ', 'png'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx'
    ],
    ['video/quicktime', 'quicktime'],
    ['application/', 'bin'],
    ['weird', 'bin'],
    ['', 'bin'],
    [undefined, 'bin']
  ])('%s → %s', (mimeType, extension) => {
    expect(resolveMediaFileExtension(mimeType)).toBe(extension)
  })
})

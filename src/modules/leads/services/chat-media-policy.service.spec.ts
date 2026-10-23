import { ChatMediaPolicyService } from './chat-media-policy.service'

describe('ChatMediaPolicyService', () => {
  describe('MAX_UPLOAD_SIZE_IN_BYTES', () => {
    it('matches the largest media type limit (documents, 100 MB)', () => {
      expect(ChatMediaPolicyService.MAX_UPLOAD_SIZE_IN_BYTES).toBe(
        100 * 1024 * 1024
      )
    })
  })

  describe('validateOutboundMediaPayload', () => {
    it.each([
      ['image', 'foto.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1],
      ['audio', 'audio.ogg', 'audio/ogg', 16 * 1024 * 1024 + 1],
      ['video', 'video.mp4', 'video/mp4', 16 * 1024 * 1024 + 1]
    ] as const)(
      'rejects a %s above its own limit',
      (type, originalname, mimetype, size) => {
        const service = new ChatMediaPolicyService()

        expect(() =>
          service.validateOutboundMediaPayload({
            type,
            file: { originalname, mimetype, size, buffer: Buffer.from('x') }
          })
        ).toThrow('File size exceeds the maximum allowed size.')
      }
    )
  })
})

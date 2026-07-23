export const OUTBOUND_MEDIA_TYPES = [
  'audio',
  'image',
  'video',
  'document'
] as const

export type OutboundMediaType = (typeof OUTBOUND_MEDIA_TYPES)[number]

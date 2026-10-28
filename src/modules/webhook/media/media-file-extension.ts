/** File extension for a stored inbound attachment, from its MIME type. */
export function resolveMediaFileExtension(mimeType?: string): string {
  const normalizedMimeType = mimeType?.trim().toLowerCase()

  if (!normalizedMimeType) {
    return 'bin'
  }

  const [rawType] = normalizedMimeType.split(';', 1)

  switch (rawType) {
    case 'audio/ogg':
      return 'ogg'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/mp4':
      return 'mp4'
    case 'audio/aac':
      return 'aac'
    case 'audio/amr':
      return 'amr'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'video/mp4':
      return 'mp4'
    case 'application/pdf':
      return 'pdf'
    case 'text/plain':
      return 'txt'
    case 'text/csv':
      return 'csv'
    case 'application/msword':
      return 'doc'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/vnd.ms-excel':
      return 'xls'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'application/vnd.ms-powerpoint':
      return 'ppt'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx'
    default: {
      const slashIndex = rawType.indexOf('/')

      if (slashIndex === -1 || slashIndex === rawType.length - 1) {
        return 'bin'
      }

      return rawType.slice(slashIndex + 1)
    }
  }
}

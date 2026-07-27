import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class LeadMessageMetadataService {
  normalizeMetadata(metadata: unknown): Record<string, unknown> | null {
    if (typeof metadata === 'undefined' || metadata === null) {
      return null
    }

    if (typeof metadata === 'string') {
      const trimmedMetadata = metadata.trim()

      if (!trimmedMetadata) {
        return null
      }

      try {
        const parsedMetadata = JSON.parse(trimmedMetadata) as unknown

        if (!parsedMetadata || typeof parsedMetadata !== 'object') {
          throw new BadRequestException('Invalid metadata payload.')
        }

        return parsedMetadata as Record<string, unknown>
      } catch {
        throw new BadRequestException('Invalid metadata payload.')
      }
    }

    if (typeof metadata !== 'object') {
      throw new BadRequestException('Invalid metadata payload.')
    }

    return metadata as Record<string, unknown>
  }

  buildOutboundMediaMetadata(params: {
    requestMetadata: Record<string, unknown> | null
    whatsappResponse: Record<string, unknown>
    storageKey: string
    uploadedMediaId: string
  }): Record<string, unknown> {
    return {
      ...(params.requestMetadata
        ? { requestMetadata: params.requestMetadata }
        : {}),
      storage: {
        key: params.storageKey
      },
      metaMedia: {
        id: params.uploadedMediaId
      },
      whatsappResponse: params.whatsappResponse
    }
  }
}

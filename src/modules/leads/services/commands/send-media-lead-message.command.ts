import { StorageUploadFile } from '../../../storage/storage.service'
import { OutboundMediaType } from '../types/outbound-media.type'

export type SendMediaLeadMessageCommand = {
  userId: string
  leadId: string
  type: OutboundMediaType
  file: StorageUploadFile | undefined
  caption?: string
  metadata?: unknown
}

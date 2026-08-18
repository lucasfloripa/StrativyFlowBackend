import { StorageUploadFile } from '../../../storage/storage.service'
import { LeadChannel } from '../../entities/lead-channel-identity.entity'
import { MessageSource } from '../../entities/message.entity'
import { OutboundMediaType } from '../types/outbound-media.type'

export type SendMediaLeadMessageCommand = {
  userId: string
  leadId: string
  type: OutboundMediaType
  file: StorageUploadFile | undefined
  caption?: string
  source?: MessageSource
  metadata?: unknown
  channel?: LeadChannel
}

import { LeadChannel } from '../../entities/lead-channel-identity.entity'
import { MessageSource } from '../../entities/message.entity'

export type SendTextLeadMessageCommand = {
  userId: string
  leadId: string
  content: string
  source?: MessageSource
  channel?: LeadChannel
}

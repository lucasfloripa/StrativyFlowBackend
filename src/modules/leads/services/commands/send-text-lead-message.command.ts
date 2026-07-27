import { MessageSource } from '../../entities/message.entity'

export type SendTextLeadMessageCommand = {
  userId: string
  leadId: string
  content: string
  source?: MessageSource
}

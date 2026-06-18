export enum AutomationTriggerType {
  ON_MESSAGE_RECEIVED = 'ON_MESSAGE_RECEIVED',
  ON_LEAD_CREATED = 'ON_LEAD_CREATED',
  ON_RUNTIME_MODE_CHANGED = 'ON_RUNTIME_MODE_CHANGED',
  ON_COLUMN_CHANGED = 'ON_COLUMN_CHANGED'
}

export type AutomationTriggerContext = {
  triggerType: AutomationTriggerType
  leadId: string
  boardId: string
  inboundMessageId?: string
  correlationId: string
  metadata?: Record<string, unknown>
}

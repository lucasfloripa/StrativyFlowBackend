import { Lead, LeadRuntimeMode } from '../../leads/entities/lead.entity'

import { ConversationType } from './conversation-classifier'

type CanRunAutomationParams = {
  lead: Lead
  conversationType: ConversationType
}

export function canRunAutomation(params: CanRunAutomationParams): boolean {
  const { lead, conversationType } = params

  void conversationType

  if (lead.runtimeMode === LeadRuntimeMode.HUMAN) {
    return false
  }

  return true
}

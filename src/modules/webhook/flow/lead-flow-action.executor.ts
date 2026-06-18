import { Injectable, Logger } from '@nestjs/common'

import { Lead, LeadFlowState } from '../../leads/entities/lead.entity'

import {
  LeadFlowAction,
  LeadFlowActionContext,
  LeadFlowActionType
} from './lead-flow.types'

@Injectable()
export class LeadFlowActionExecutor {
  private readonly logger = new Logger(LeadFlowActionExecutor.name)

  async execute(params: {
    context: LeadFlowActionContext
    lead: Lead
    actions: LeadFlowAction[]
    transitionLeadFlowState: (params: {
      lead: Lead
      to: LeadFlowState
    }) => Promise<void>
    sendWhatsAppMessage: (params: {
      context: LeadFlowActionContext
      to: string
      content: string
    }) => Promise<{
      whatsappMessageId?: string | null
    }>
    persistOutboundMessage: (params: {
      context: LeadFlowActionContext
      leadId: string
      content: string
      whatsappMessageId?: string | null
    }) => Promise<void>
  }): Promise<void> {
    const {
      context,
      lead,
      actions,
      transitionLeadFlowState,
      sendWhatsAppMessage,
      persistOutboundMessage
    } = params

    for (const action of actions) {
      switch (action.type) {
        case LeadFlowActionType.UPDATE_LEAD:
          this.logger.debug(
            `[${context.correlationId}] Executing UPDATE_LEAD action`
          )
          Object.assign(lead, action.payload)
          break
        case LeadFlowActionType.TRANSITION_STATE:
          this.logger.debug(
            `[${context.correlationId}] Executing TRANSITION_STATE action`
          )
          await transitionLeadFlowState({
            lead,
            to: action.payload.to
          })
          break
        case LeadFlowActionType.SEND_MESSAGE: {
          this.logger.debug(
            `[${context.correlationId}] Executing SEND_MESSAGE action`
          )
          const { whatsappMessageId } = await sendWhatsAppMessage({
            context,
            to: lead.phone,
            content: action.payload.content
          })

          await persistOutboundMessage({
            context,
            leadId: lead.id,
            content: action.payload.content,
            whatsappMessageId
          })
          break
        }
        default:
          break
      }
    }
  }
}

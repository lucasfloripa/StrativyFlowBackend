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
    /** Queues an automatic reply (stored first, then sent). */
    sendMessage: (params: {
      context: LeadFlowActionContext
      leadId: string
      to: string
      content: string
    }) => Promise<void>
  }): Promise<void> {
    const { context, lead, actions, transitionLeadFlowState, sendMessage } =
      params

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
          const destination =
            context.externalUserId?.trim() || lead.phone?.trim()
          if (!destination) {
            throw new Error(
              `Cannot send flow message for lead ${lead.id} without an external destination`
            )
          }

          await sendMessage({
            context,
            leadId: lead.id,
            to: destination,
            content: action.payload.content
          })
          break
        }
        default:
          break
      }
    }
  }
}

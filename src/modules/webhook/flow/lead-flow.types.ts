import { Lead, LeadFlowState } from '../../leads/entities/lead.entity'

export enum LeadFlowActionType {
  UPDATE_LEAD = 'UPDATE_LEAD',
  TRANSITION_STATE = 'TRANSITION_STATE',
  SEND_MESSAGE = 'SEND_MESSAGE'
}

type UpdateLeadAction = {
  type: LeadFlowActionType.UPDATE_LEAD
  payload: Partial<Lead>
}

type TransitionStateAction = {
  type: LeadFlowActionType.TRANSITION_STATE
  payload: {
    to: LeadFlowState
  }
}

type SendMessageAction = {
  type: LeadFlowActionType.SEND_MESSAGE
  payload: {
    content: string
  }
}

export type LeadFlowAction =
  | UpdateLeadAction
  | TransitionStateAction
  | SendMessageAction

export type LeadFlowActionContext = {
  trigger: 'webhook'
  phoneNumberId?: string
  inboundMessageId?: string
  correlationId: string
}

export type LeadFlowProcessResult = {
  actions: LeadFlowAction[]
}

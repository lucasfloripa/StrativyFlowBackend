export enum AutomationActionType {
  SEND_MESSAGE = 'SEND_MESSAGE',
  MOVE_COLUMN = 'MOVE_COLUMN',
  CREATE_FOLLOWUP = 'CREATE_FOLLOWUP',
  SET_RUNTIME_MODE = 'SET_RUNTIME_MODE',
  TAG_LEAD = 'TAG_LEAD'
}

export type AutomationAction = {
  type: AutomationActionType
  payload: Record<string, unknown>
}

import { RABBIT_EXCHANGE } from '../../modules/rabbit/constants/rabbit.constants'

export const NOTIFICATION_EXCHANGE = RABBIT_EXCHANGE
export const NOTIFICATION_QUEUE = 'notification.queue'
export const MESSAGE_RECEIVED_QUEUE = 'notifications.queue'
export const FOLLOWUP_REMINDER_1H_QUEUE =
  'notification.followup-reminder-1h.queue'
export const LEAD_CREATED_EVENT = 'lead.created'
export const MESSAGE_RECEIVED_EVENT = 'message.received'
export const FOLLOWUP_REMINDER_1H_EVENT = 'followup.reminder.1h'

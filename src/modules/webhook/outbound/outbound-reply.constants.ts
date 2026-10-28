/** Asks the worker to send one `queued` automatic reply (a `messages` row). */
export const MESSAGE_OUTBOUND_SEND_ROUTING_KEY = 'message.outbound.send'
export const MESSAGE_OUTBOUND_QUEUE = 'message.outbound.queue'

export type OutboundReplyJob = { messageId: string }

/** Where a queued reply goes; stored in `messages.metadata.outbound`. */
export type OutboundReplyTarget = {
  companyId: string
  externalAccountId: string
  to: string
  attempts: number
  error?: string
}

/** Asks the worker to download one inbound attachment and store it in R2. */
export const MESSAGE_MEDIA_FETCH_ROUTING_KEY = 'message.media.fetch'
export const MESSAGE_MEDIA_QUEUE = 'message.media.queue'

export type InboundMediaJob = { messageId: string }

export type InboundMediaSource =
  | { kind: 'whatsapp'; metaMediaId: string }
  | { kind: 'url'; url: string }

/** Stored in `messages.metadata.media` until the file is in R2. */
export type InboundMediaState = {
  source: InboundMediaSource
  companyId: string
  attempts: number
  error?: string
}

/** RabbitMQ message asking the worker to process one `inbound_events` row. */
export const WEBHOOK_INBOUND_ROUTING_KEY = 'webhook.inbound'
export const WEBHOOK_INBOUND_QUEUE = 'webhook.inbound.queue'

export type WebhookInboundJob = { inboundEventId: string }

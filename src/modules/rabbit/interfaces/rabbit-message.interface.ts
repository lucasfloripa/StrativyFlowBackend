export interface RabbitMessage {
  eventId: string
  event: string
  occurredAt: string
  data: unknown
}

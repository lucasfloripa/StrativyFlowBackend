/**
 * Injection token for whatever delivers realtime events to the web app in
 * the current process: the Socket.IO gateway in the API, the RabbitMQ bridge
 * (through the outbox) in the worker.
 */
export const REALTIME_EMITTER = Symbol('REALTIME_EMITTER')

export interface RealtimeEmitter {
  emitToLead(leadId: string, event: string, payload: unknown): void
  emitToUser(userId: string, event: string, payload: unknown): void
  emitBroadcast(event: string, payload: unknown): void
}

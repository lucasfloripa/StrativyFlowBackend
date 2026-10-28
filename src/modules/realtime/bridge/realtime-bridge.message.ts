export const REALTIME_EMIT_ROUTING_KEY = 'realtime.emit'

export type RealtimeEmitCommand =
  | { target: 'lead'; leadId: string; event: string; payload: unknown }
  | { target: 'user'; userId: string; event: string; payload: unknown }
  | { target: 'broadcast'; event: string; payload: unknown }

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/** Validates a `realtime.emit` message body; `null` when it is malformed. */
export function parseRealtimeEmitCommand(
  data: unknown
): RealtimeEmitCommand | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const command = data as Record<string, unknown>
  if (!isNonEmptyString(command.event)) {
    return null
  }

  const { event, payload } = command

  switch (command.target) {
    case 'lead':
      return isNonEmptyString(command.leadId)
        ? { target: 'lead', leadId: command.leadId, event, payload }
        : null
    case 'user':
      return isNonEmptyString(command.userId)
        ? { target: 'user', userId: command.userId, event, payload }
        : null
    case 'broadcast':
      return { target: 'broadcast', event, payload }
    default:
      return null
  }
}

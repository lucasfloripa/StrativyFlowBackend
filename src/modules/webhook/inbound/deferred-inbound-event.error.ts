/**
 * The event cannot be applied yet but probably will be soon, e.g. a delivery
 * status for an outbound message whose Graph API ID is not stored yet (P8).
 * The worker retries it with backoff; once the attempts run out it is
 * recorded as `ignored` with `reason`, not as `failed`.
 */
export class DeferredInboundEventError extends Error {
  constructor(readonly reason: string) {
    super(`Inbound event deferred: ${reason}`)
    this.name = DeferredInboundEventError.name
  }
}

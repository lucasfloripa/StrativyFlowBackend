import type { ThrottlerOptions } from '@nestjs/throttler'

const ONE_MINUTE_IN_MS = 60_000

/**
 * Base throttler. It only applies to routes that opt in with
 * `@UseGuards(ThrottlerGuard)`; authenticated CRM routes are not limited.
 */
export const DEFAULT_THROTTLER: ThrottlerOptions = {
  name: 'default',
  ttl: ONE_MINUTE_IN_MS,
  limit: 10
}

// Meta calls the verification handshake only when a webhook is (re)subscribed.
export const WEBHOOK_HANDSHAKE_THROTTLE = {
  default: { ttl: ONE_MINUTE_IN_MS, limit: 10 }
}

// Load balancer and uptime probes poll every few seconds.
export const HEALTH_CHECK_THROTTLE = {
  default: { ttl: ONE_MINUTE_IN_MS, limit: 60 }
}

// Platform onboarding: a person with Postman, so a tight limit is enough.
export const ADMIN_ROUTE_THROTTLE = {
  default: { ttl: ONE_MINUTE_IN_MS, limit: 5 }
}

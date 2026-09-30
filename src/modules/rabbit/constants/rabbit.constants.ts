export const RABBIT_EXCHANGE = 'strativyflow.events'
export const RABBIT_RETRY_EXCHANGE = 'strativyflow.retry'
export const RABBIT_DEAD_LETTER_EXCHANGE = 'strativyflow.dead-letter'

export const DEFAULT_RABBIT_PREFETCH = 10
export const DEFAULT_RABBIT_PUBLISH_CONCURRENCY = 10
export const DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS = 3
export const DEFAULT_RABBIT_RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

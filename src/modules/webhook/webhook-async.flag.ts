import type { ConfigService } from '@nestjs/config'

export const WEBHOOK_ASYNC_PROCESSING = 'WEBHOOK_ASYNC_PROCESSING'

/** `WEBHOOK_ASYNC_PROCESSING=true|1`: the worker processes webhooks and replies. */
export function isWebhookAsyncProcessingEnabled(
  configService: ConfigService
): boolean {
  const value = configService.get<string>(WEBHOOK_ASYNC_PROCESSING)
  return ['true', '1'].includes(value?.trim().toLowerCase() ?? '')
}

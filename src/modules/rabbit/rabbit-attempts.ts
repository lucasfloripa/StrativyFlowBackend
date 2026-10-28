import { DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS } from './constants/rabbit.constants'

import type { ConfigService } from '@nestjs/config'

/**
 * How many times a consumer sees one message: the first delivery plus every
 * retry of `RABBIT_MAX_RETRY_ATTEMPTS`. Handlers use it to give up cleanly
 * on the last attempt instead of letting the message go to the DLQ.
 */
export function rabbitDeliveryAttempts(configService: ConfigService): number {
  const retries = Number(configService.get<string>('RABBIT_MAX_RETRY_ATTEMPTS'))

  return (
    1 +
    (Number.isInteger(retries) && retries >= 0
      ? retries
      : DEFAULT_RABBIT_MAX_RETRY_ATTEMPTS)
  )
}

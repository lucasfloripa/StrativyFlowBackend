import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'

import { DEFAULT_THROTTLER } from './rate-limit.constants'

/**
 * In-memory counters: correct for a single API instance. With more than one
 * instance, move the storage to Redis so the limit is shared.
 */
@Module({
  imports: [ThrottlerModule.forRoot([DEFAULT_THROTTLER])]
})
export class RateLimitModule {}

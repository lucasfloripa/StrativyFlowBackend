import { Global, Module } from '@nestjs/common'

import { CompanyAccessModule } from '../auth/company-access.module'
import { RabbitModule } from '../rabbit/rabbit.module'

import { RealtimeBridgeConsumer } from './bridge/realtime-bridge.consumer'
import { REALTIME_EMITTER } from './realtime-emitter'
import { RealtimeGateway } from './realtime.gateway'
import { RealtimeService } from './realtime.service'

/**
 * Realtime for the API process: the Socket.IO gateway, bound to
 * `REALTIME_EMITTER`, plus the consumer of events the worker sends through
 * the bridge. Global, so feature modules inject `REALTIME_EMITTER` without
 * importing the gateway (the worker binds it to `RealtimeOutboxModule`).
 */
@Global()
@Module({
  imports: [CompanyAccessModule, RabbitModule],
  providers: [
    RealtimeGateway,
    RealtimeService,
    { provide: REALTIME_EMITTER, useExisting: RealtimeService },
    RealtimeBridgeConsumer
  ],
  exports: [RealtimeService, REALTIME_EMITTER]
})
export class RealtimeModule {}

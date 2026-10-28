import { Global, Module } from '@nestjs/common'

import { OutboxModule } from '../outbox/outbox.module'

import { RealtimeOutboxEmitter } from './bridge/realtime-outbox.emitter'
import { REALTIME_EMITTER } from './realtime-emitter'

/**
 * Realtime for processes without the Socket.IO gateway (the worker): binds
 * `REALTIME_EMITTER` to the outbox bridge. Import it once, at the root.
 */
@Global()
@Module({
  imports: [OutboxModule],
  providers: [{ provide: REALTIME_EMITTER, useClass: RealtimeOutboxEmitter }],
  exports: [REALTIME_EMITTER]
})
export class RealtimeOutboxModule {}

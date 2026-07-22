import { Injectable, Logger } from '@nestjs/common'

import type { RealtimeGateway } from './realtime.gateway'

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name)
  private gateway: RealtimeGateway | null = null

  registerGateway(gateway: RealtimeGateway): void {
    this.gateway = gateway
  }

  emitToLead(leadId: string, event: string, payload: unknown): void {
    if (!this.gateway) {
      this.logger.warn(
        `emitToLead skipped because gateway is not ready. leadId=${leadId} event=${event}`
      )
      return
    }

    this.gateway.emitToLead(leadId, event, payload)
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.gateway) {
      this.logger.warn(
        `emitToUser skipped because gateway is not ready. userId=${userId} event=${event}`
      )
      return
    }

    this.gateway.emitToUser(userId, event, payload)
  }

  emitBroadcast(event: string, payload: unknown): void {
    if (!this.gateway) {
      this.logger.warn(
        `emitBroadcast skipped because gateway is not ready. event=${event}`
      )
      return
    }

    this.gateway.emitBroadcast(event, payload)
  }
}

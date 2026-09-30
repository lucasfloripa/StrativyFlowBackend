import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

@Injectable()
export class WorkerHeartbeatService {
  @Cron('*/5 * * * * *')
  logHeartbeat(): void {
    console.log(`[Worker] Worker is alive - ${new Date().toISOString()}`)
  }
}

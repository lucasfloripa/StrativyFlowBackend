import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Notification } from '../entities/notification.entity'

@Injectable()
export class CleanupReadNotificationsCron {
  private readonly logger = new Logger(CleanupReadNotificationsCron.name)

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>
  ) {}

  @Cron('0 0 * * * *')
  async cleanupReadNotifications(): Promise<void> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('"isRead" = true')
      .execute()

    const deletedCount = result.affected ?? 0

    if (deletedCount > 0) {
      this.logger.log(`Deleted ${deletedCount} read notification(s)`)
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'

import { Notification, NotificationType } from './entities/notification.entity'
import {
  CreateNotificationInput,
  NotificationRepository
} from './repositories/notification.repository'

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository
  ) {}

  async createNotification(
    input: CreateNotificationInput
  ): Promise<Notification> {
    return this.notificationRepository.createOne(input)
  }

  async listByUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.findByUserId(userId)
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.markAsRead(userId, id)

    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    return notification
  }

  async markAllAsRead(
    userId: string,
    type?: NotificationType,
    referenceId?: string
  ): Promise<{ updatedCount: number }> {
    const updatedCount = await this.notificationRepository.markAllAsRead(
      userId,
      type,
      referenceId
    )

    return { updatedCount }
  }
}

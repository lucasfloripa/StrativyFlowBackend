import { Injectable, NotFoundException } from '@nestjs/common'

import {
  Notification,
  NotificationReferenceType,
  NotificationType
} from './entities/notification.entity'
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

  async ensureLeadCreatedNotification(params: {
    organizationId?: string | null
    userId: string
    leadId: string
    leadName: string
  }): Promise<void> {
    const existingNotification =
      await this.notificationRepository.findByUserTypeAndReferenceId(
        params.userId,
        NotificationType.LEAD_CREATED,
        params.leadId
      )

    if (existingNotification) {
      return
    }

    await this.notificationRepository.createOne({
      organizationId: params.organizationId ?? null,
      userId: params.userId,
      type: NotificationType.LEAD_CREATED,
      title: 'Novo lead criado',
      description: params.leadName,
      referenceType: NotificationReferenceType.LEAD,
      referenceId: params.leadId
    })
  }

  async syncUnreadMessageNotificationDescriptions(params: {
    userId: string
    leadId: string
    leadName: string
  }): Promise<void> {
    await this.notificationRepository.updateUnreadMessageDescriptions({
      userId: params.userId,
      referenceId: params.leadId,
      description: params.leadName
    })
  }

  async listByUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.findByUserId(userId)
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOneByIdAndUser(
      userId,
      id
    )

    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    if (notification.type === NotificationType.MESSAGE_RECEIVED) {
      await this.notificationRepository.markAllAsRead(
        userId,
        NotificationType.MESSAGE_RECEIVED,
        notification.referenceId
      )

      notification.isRead = true
      notification.readAt = notification.readAt ?? new Date()

      return notification
    }

    const updatedNotification = await this.notificationRepository.markAsRead(
      userId,
      id
    )

    if (!updatedNotification) {
      throw new NotFoundException('Notification not found')
    }

    return updatedNotification
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

  async removeOne(userId: string, id: string): Promise<void> {
    const deletedCount = await this.notificationRepository.deleteByIdAndUser(
      userId,
      id
    )

    if (!deletedCount) {
      throw new NotFoundException('Notification not found')
    }
  }

  async removeAll(
    userId: string,
    type?: NotificationType,
    referenceId?: string
  ): Promise<{ deletedCount: number }> {
    const deletedCount = await this.notificationRepository.deleteAll(
      userId,
      type,
      referenceId
    )

    return { deletedCount }
  }
}

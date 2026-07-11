import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Repository } from 'typeorm'

import {
  Notification,
  NotificationReferenceType,
  NotificationType
} from '../entities/notification.entity'

export type CreateNotificationInput = {
  organizationId?: string | null
  userId: string
  type: NotificationType
  title: string
  description: string
  referenceType: NotificationReferenceType
  referenceId: string
}

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(Notification)
    private readonly repository: Repository<Notification>
  ) {}

  async createOne(input: CreateNotificationInput): Promise<Notification> {
    const notification = this.repository.create({
      organizationId: input.organizationId ?? null,
      userId: input.userId,
      type: input.type,
      title: input.title,
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      isRead: false,
      readAt: null
    })

    return this.repository.save(notification)
  }

  async findByUserId(userId: string): Promise<Notification[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    return this.repository.find({
      where: {
        userId,
        isRead: false,
        createdAt: MoreThanOrEqual(twentyFourHoursAgo)
      },
      order: { createdAt: 'DESC' }
    })
  }

  async markAsRead(userId: string, id: string): Promise<Notification | null> {
    const notification = await this.repository.findOne({
      where: {
        id,
        userId
      }
    })

    if (!notification) {
      return null
    }

    if (!notification.isRead) {
      notification.isRead = true
      notification.readAt = new Date()
      return this.repository.save(notification)
    }

    return notification
  }

  async markAllAsRead(
    userId: string,
    type?: NotificationType,
    referenceId?: string
  ): Promise<number> {
    const queryBuilder = this.repository
      .createQueryBuilder()
      .update(Notification)
      .set({
        isRead: true,
        readAt: () => 'CURRENT_TIMESTAMP'
      })
      .where('"userId" = :userId', { userId })
      .andWhere('"isRead" = false')

    if (type) {
      queryBuilder.andWhere('"type" = :type', { type })
    }

    if (referenceId) {
      queryBuilder.andWhere('"referenceId" = :referenceId', { referenceId })
    }

    const result = await queryBuilder.execute()

    return result.affected ?? 0
  }
}

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
    const notification = await this.findOneByIdAndUser(userId, id)

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

  async findOneByIdAndUser(
    userId: string,
    id: string
  ): Promise<Notification | null> {
    return this.repository.findOne({
      where: {
        id,
        userId
      }
    })
  }

  async findByUserTypeAndReferenceId(
    userId: string,
    type: NotificationType,
    referenceId: string
  ): Promise<Notification | null> {
    return this.repository.findOne({
      where: {
        userId,
        type,
        referenceId
      }
    })
  }

  async updateUnreadMessageDescriptions(params: {
    userId: string
    referenceId: string
    description: string
  }): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Notification)
      .set({
        description: params.description
      })
      .where('"userId" = :userId', { userId: params.userId })
      .andWhere('"type" = :type', {
        type: NotificationType.MESSAGE_RECEIVED
      })
      .andWhere('"referenceId" = :referenceId', {
        referenceId: params.referenceId
      })
      .andWhere('"isRead" = false')
      .execute()

    return result.affected ?? 0
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

  async deleteByIdAndUser(userId: string, id: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('"id" = :id', { id })
      .andWhere('"userId" = :userId', { userId })
      .execute()

    return result.affected ?? 0
  }

  async deleteAll(
    userId: string,
    type?: NotificationType,
    referenceId?: string
  ): Promise<number> {
    const queryBuilder = this.repository
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('"userId" = :userId', { userId })

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

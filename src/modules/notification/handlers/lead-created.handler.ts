import { Injectable, Logger } from '@nestjs/common'

import { RabbitMessage } from '../../rabbit/interfaces/rabbit-message.interface'
import {
  NotificationReferenceType,
  NotificationType
} from '../entities/notification.entity'
import { NotificationService } from '../notification.service'

import { NotificationEventHandler } from './notification-event-handler.interface'

@Injectable()
export class LeadCreatedHandler implements NotificationEventHandler {
  readonly event = 'lead.created' as const

  private readonly logger = new Logger(LeadCreatedHandler.name)

  constructor(private readonly notificationService: NotificationService) {}

  async handle(message: RabbitMessage): Promise<void> {
    const data = this.asRecord(message.data)
    const userId = this.getString(data, 'userId')
    const leadId = this.getString(data, 'leadId')
    const leadName = this.getString(data, 'leadName')
    const description =
      this.getString(data, 'description') ?? leadName ?? 'Lead sem nome'

    if (!userId || !leadId) {
      this.logger.warn(
        'Skipping lead.created notification due to invalid payload'
      )
      return
    }

    await this.notificationService.createNotification({
      organizationId: this.getString(data, 'organizationId') ?? null,
      userId,
      type: NotificationType.LEAD_CREATED,
      title: 'Novo lead criado',
      description,
      referenceType: NotificationReferenceType.LEAD,
      referenceId: leadId
    })
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>
    }

    return {}
  }

  private getString(
    payload: Record<string, unknown>,
    key: string
  ): string | null {
    const raw = payload[key]

    if (typeof raw !== 'string') {
      return null
    }

    const normalized = raw.trim()
    return normalized ? normalized : null
  }
}

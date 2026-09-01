import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { NotificationType } from './entities/notification.entity'
import { NotificationService } from './notification.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id

    return this.notificationService.listByUser(userId)
  }

  @Patch('read-all')
  markAllAsRead(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('referenceId') referenceId?: string
  ) {
    const userId = req.user.id
    const notificationType = this.resolveNotificationType(type)

    return this.notificationService.markAllAsRead(
      userId,
      notificationType,
      referenceId
    )
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id

    return this.notificationService.markAsRead(userId, id)
  }

  @Delete()
  removeAll(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('referenceId') referenceId?: string
  ) {
    const userId = req.user.id
    const notificationType = this.resolveNotificationType(type)

    return this.notificationService.removeAll(
      userId,
      notificationType,
      referenceId
    )
  }

  @Delete(':id')
  removeOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id

    return this.notificationService.removeOne(userId, id)
  }

  private resolveNotificationType(
    value?: string
  ): NotificationType | undefined {
    if (!value) {
      return undefined
    }

    if (value === 'LEAD_CREATED') {
      return NotificationType.LEAD_CREATED
    }

    if (value === 'MESSAGE_RECEIVED') {
      return NotificationType.MESSAGE_RECEIVED
    }

    if (value === 'FOLLOW_UP_REMINDER_1H') {
      return NotificationType.FOLLOW_UP_REMINDER_1H
    }

    if (value === 'DAILY_FOLLOWUP_SUMMARY') {
      return NotificationType.DAILY_FOLLOWUP_SUMMARY
    }

    if (value === 'CONVERSATION_EXPIRING_1H') {
      return NotificationType.CONVERSATION_EXPIRING_1H
    }

    if (value === 'CONVERSATION_EXPIRED') {
      return NotificationType.CONVERSATION_EXPIRED
    }

    throw new BadRequestException('Invalid notification type')
  }
}

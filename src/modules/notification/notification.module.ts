import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AutomationModule } from '../automation/automation.module'
import { Message } from '../leads/entities/message.entity'
import { MailModule } from '../mail/mail.module'
import { RabbitModule } from '../rabbit/rabbit.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { NotificationConsumer } from './consumers/notification.consumer'
import { FollowUpReminder1hCron } from './cron/followup-reminder-1h.cron'
import { Notification } from './entities/notification.entity'
import { LeadCreatedHandler } from './handlers/lead-created.handler'
import { MessageReceivedHandler } from './handlers/message-received.handler'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { NotificationRepository } from './repositories/notification.repository'

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, UserInformations, Message]),
    AutomationModule,
    MailModule,
    RabbitModule
  ],
  controllers: [NotificationController],
  providers: [
    NotificationRepository,
    NotificationService,
    FollowUpReminder1hCron,
    LeadCreatedHandler,
    MessageReceivedHandler,
    NotificationConsumer
  ],
  exports: [NotificationService]
})
export class NotificationModule {}

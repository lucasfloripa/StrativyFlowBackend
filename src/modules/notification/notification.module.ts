import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RabbitModule } from '../rabbit/rabbit.module'

import { NotificationConsumer } from './consumers/notification.consumer'
import { Notification } from './entities/notification.entity'
import { LeadCreatedHandler } from './handlers/lead-created.handler'
import { MessageReceivedHandler } from './handlers/message-received.handler'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { NotificationRepository } from './repositories/notification.repository'

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), RabbitModule],
  controllers: [NotificationController],
  providers: [
    NotificationRepository,
    NotificationService,
    LeadCreatedHandler,
    MessageReceivedHandler,
    NotificationConsumer
  ],
  exports: [NotificationService]
})
export class NotificationModule {}

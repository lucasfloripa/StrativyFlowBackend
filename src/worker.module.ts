import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DatabaseModule } from './database/database.module'
import { EvolutionModule } from './modules/evolution/evolution.module'
import { FollowUp } from './modules/followup/entities/followup.entity'
import { FollowUpExecutionModule } from './modules/followup/followup-execution.module'
import { Lead } from './modules/leads/entities/lead.entity'
import { Message } from './modules/leads/entities/message.entity'
import { MailModule } from './modules/mail/mail.module'
import { NegotiationPaymentDomainModule } from './modules/negotiation/negotiation-payment-domain.module'
import { Notification } from './modules/notification/entities/notification.entity'
import { NotificationService } from './modules/notification/notification.service'
import { NotificationRepository } from './modules/notification/repositories/notification.repository'
import { RabbitModule } from './modules/rabbit/rabbit.module'
import { UserInformations } from './modules/user/entities/user-informations.entity'
import { FollowUpExecutionScheduler } from './worker/notifications/followup-execution-scheduler.service'
import { FollowUpReminderScheduler } from './worker/notifications/followup-reminder-scheduler.service'
import { NotificationWorker } from './worker/notifications/notification-worker.service'
import { PaymentScheduler } from './worker/payments/payment-scheduler.service'
import { PaymentWorker } from './worker/payments/payment-worker.service'
import { WorkerHeartbeatService } from './worker/worker-heartbeat.service'

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      Notification,
      UserInformations,
      Message,
      Lead,
      FollowUp
    ]),
    FollowUpExecutionModule,
    NegotiationPaymentDomainModule,
    MailModule,
    EvolutionModule,
    RabbitModule,
    ScheduleModule.forRoot()
  ],
  providers: [
    WorkerHeartbeatService,
    PaymentScheduler,
    PaymentWorker,
    NotificationRepository,
    NotificationService,
    FollowUpExecutionScheduler,
    FollowUpReminderScheduler,
    NotificationWorker
  ]
})
export class WorkerModule {}

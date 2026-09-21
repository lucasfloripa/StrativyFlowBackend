import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { EvolutionModule } from '../evolution/evolution.module'
import { FollowUp } from '../followup/entities/followup.entity'
import { Lead } from '../leads/entities/lead.entity'
import { MailModule } from '../mail/mail.module'
import { NegotiationPayment } from '../negotiation/entities/negotiation-payment.entity'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { NegotiationModule } from '../negotiation/negotiation.module'
import { NotificationModule } from '../notification/notification.module'
import { UserInformations } from '../user/entities/user-informations.entity'

import { PaymentDueTomorrowCronService } from './payment-due-tomorrow-cron.service'
import { PaymentOverdueCronService } from './payment-overdue-cron.service'
import { ReminderCronService } from './reminder-cron.service'
import { ReminderController } from './reminder.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUp,
      Negotiation,
      NegotiationPayment,
      Lead,
      UserInformations
    ]),
    EvolutionModule,
    MailModule,
    NegotiationModule,
    NotificationModule
  ],
  controllers: [ReminderController],
  providers: [
    ReminderCronService,
    PaymentDueTomorrowCronService,
    PaymentOverdueCronService
  ]
})
export class ReminderModule {}

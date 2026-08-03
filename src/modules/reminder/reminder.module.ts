import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AutomationModule } from '../automation/automation.module'
import { FollowUp } from '../followup/entities/followup.entity'
import { Lead } from '../leads/entities/lead.entity'
import { MailModule } from '../mail/mail.module'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { ReminderCronService } from './reminder-cron.service'
import { ReminderController } from './reminder.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([FollowUp, Negotiation, Lead, UserInformations]),
    AutomationModule,
    MailModule
  ],
  controllers: [ReminderController],
  providers: [ReminderCronService]
})
export class ReminderModule {}

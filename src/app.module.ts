import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { DatabaseModule } from './database/database.module'
import { CompanyModule } from './modules/company/company.module'
import { ContactsModule } from './modules/contacts/contacts.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { FinanceiroModule } from './modules/financeiro/financeiro.module'
import { FollowUpModule } from './modules/followup/followup.module'
import { HealthModule } from './modules/health/health.module'
import { LeadsModule } from './modules/leads/leads.module'
import { NegotiationModule } from './modules/negotiation/negotiation.module'
import { NotificationModule } from './modules/notification/notification.module'
import { RabbitModule } from './modules/rabbit/rabbit.module'
import { RateLimitModule } from './modules/rate-limit/rate-limit.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { ReminderModule } from './modules/reminder/reminder.module'
import { StorageModule } from './modules/storage/storage.module'
import { UserModule } from './modules/user/user.module'
import { WebhookModule } from './modules/webhook/webhook.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    ContactsModule,
    CompanyModule,
    DashboardModule,
    FinanceiroModule,
    FollowUpModule,
    HealthModule,
    LeadsModule,
    NegotiationModule,
    NotificationModule,
    RabbitModule,
    RateLimitModule,
    RealtimeModule,
    ReminderModule,
    StorageModule,
    UserModule,
    WebhookModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}

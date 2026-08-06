import { join } from 'path'

import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DashboardModule } from './modules/dashboard/dashboard.module'
import { FinanceiroModule } from './modules/financeiro/financeiro.module'
import { FollowUpModule } from './modules/followup/followup.module'
import { LeadsModule } from './modules/leads/leads.module'
import { NegotiationModule } from './modules/negotiation/negotiation.module'
import { NotificationModule } from './modules/notification/notification.module'
import { RabbitModule } from './modules/rabbit/rabbit.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { StorageModule } from './modules/storage/storage.module'
import { UserModule } from './modules/user/user.module'
import { WebhookModule } from './modules/webhook/webhook.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'dev'}`
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbHost = config.get<string>('DB_HOST')
        const dbPort = Number(config.get('DB_PORT'))
        const dbUsername = config.get<string>('DB_USERNAME')
        const dbPassword = config.get<string>('DB_PASSWORD')
        const dbName = config.get<string>('DB_NAME')
        const dbSynchronize = config.get<string>('DB_SYNCHRONIZE') === 'true'
        const dbSsl = config.get<string>('DB_SSL') === 'true'

        return {
          type: 'postgres',
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbName,
          autoLoadEntities: true,
          migrations: [join(__dirname, '/database/migrations/*{.ts,.js}')],
          synchronize: dbSynchronize,
          ssl: dbSsl ? { rejectUnauthorized: false } : false
        }
      }
    }),
    DashboardModule,
    FinanceiroModule,
    FollowUpModule,
    LeadsModule,
    NegotiationModule,
    NotificationModule,
    RabbitModule,
    RealtimeModule,
    StorageModule,
    UserModule,
    WebhookModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}

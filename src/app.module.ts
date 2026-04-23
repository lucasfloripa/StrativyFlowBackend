/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BoardModule } from './modules/board/board.module'
import { LeadsModule } from './modules/leads/leads.module'
import { WebhookModule } from './modules/webhook/webhook.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'dev'}`
    }),
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

        console.log(
          dbHost,
          dbPort,
          dbUsername,
          dbPassword,
          dbName,
          dbSynchronize,
          dbSsl
        )

        return {
          type: 'postgres',
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbName,
          autoLoadEntities: true,
          synchronize: dbSynchronize,
          ssl: dbSsl ? { rejectUnauthorized: false } : false
        }
      }
    }),
    LeadsModule,
    WebhookModule,
    BoardModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BoardModule } from './modules/board/board.module'
import { LeadsModule } from './modules/leads/leads.module'
import { WebhookModule } from './modules/webhook/webhook.module'

const dbHost = process.env.DB_HOST
const dbPort = Number(process.env.DB_PORT)
const dbUsername = process.env.DB_USERNAME
const dbPassword = process.env.DB_PASSWORD
const dbName = process.env.DB_NAME
const dbSynchronize = process.env.DB_SYNCHRONIZE === 'true'
const dbSsl = process.env.DB_SSL === 'true'

if (!dbHost || Number.isNaN(dbPort) || !dbUsername || !dbPassword || !dbName) {
  throw new Error('Database env vars are not fully configured')
}

@Module({
  imports: [
    LeadsModule,
    WebhookModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUsername,
      password: dbPassword,
      database: dbName,
      autoLoadEntities: true,
      synchronize: dbSynchronize,
      ssl: dbSsl ? { rejectUnauthorized: false } : false
    }),
    BoardModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}

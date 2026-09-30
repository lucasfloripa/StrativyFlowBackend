import { join } from 'path'

import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

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
        const dbMigrationsRun =
          config.get<string>('DB_MIGRATIONS_RUN') === 'true'
        const dbSsl = config.get<string>('DB_SSL') === 'true'

        return {
          type: 'postgres' as const,
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbName,
          autoLoadEntities: true,
          migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
          migrationsRun: dbMigrationsRun,
          synchronize: dbSynchronize,
          ssl: dbSsl ? { rejectUnauthorized: false } : false
        }
      }
    })
  ],
  exports: [ConfigModule, TypeOrmModule]
})
export class DatabaseModule {}

import { Module, Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { S3Client } from '@aws-sdk/client-s3'

import { R2_S3_CLIENT } from './storage.constants'
import { StorageController } from './storage.controller'
import { StorageService } from './storage.service'

const r2ClientProvider: Provider = {
  provide: R2_S3_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const endpoint = configService.getOrThrow<string>('R2_ENDPOINT')
    const accessKeyId = configService.getOrThrow<string>('R2_ACCESS_KEY_ID')
    const secretAccessKey = configService.getOrThrow<string>('R2_SECRET_ACCESS_KEY')
    const region = configService.getOrThrow<string>('R2_REGION')

    return new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  }
}

@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [r2ClientProvider, StorageService],
  exports: [StorageService]
})
export class StorageModule {}

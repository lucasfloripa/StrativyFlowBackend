import { Module } from '@nestjs/common'

import {
  metaAppSecretsProvider,
  MetaWebhookSignatureGuard
} from './security/meta-webhook-signature.guard'
import { WebhookIngestionService } from './webhook-ingestion.service'
import { WebhookProcessingModule } from './webhook-processing.module'
import { WebhookController } from './webhook.controller'

@Module({
  imports: [WebhookProcessingModule],
  providers: [
    metaAppSecretsProvider,
    MetaWebhookSignatureGuard,
    WebhookIngestionService
  ],
  controllers: [WebhookController],
  exports: [WebhookProcessingModule]
})
export class WebhookModule {}

import { Module } from '@nestjs/common'

import { RabbitConsumerService } from './services/rabbit-consumer.service'
import { RabbitConnectionService } from './services/rabbit-connection.service'
import { RabbitPublisherService } from './services/rabbit-publisher.service'

@Module({
  providers: [
    RabbitConnectionService,
    RabbitPublisherService,
    RabbitConsumerService
  ],
  exports: [
    RabbitConnectionService,
    RabbitPublisherService,
    RabbitConsumerService
  ]
})
export class RabbitModule {}

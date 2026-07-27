import { Module } from '@nestjs/common'

import { RabbitConnectionService } from './services/rabbit-connection.service'
import { RabbitConsumerService } from './services/rabbit-consumer.service'
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

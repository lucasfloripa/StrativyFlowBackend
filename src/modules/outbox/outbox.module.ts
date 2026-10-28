import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RabbitModule } from '../rabbit/rabbit.module'

import { OutboxMessage } from './entities/outbox-message.entity'
import { OutboxRelayService } from './services/outbox-relay.service'
import { OutboxService } from './services/outbox.service'

@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage]), RabbitModule],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService]
})
export class OutboxModule {}

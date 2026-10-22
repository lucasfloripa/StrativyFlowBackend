import { Module } from '@nestjs/common'

import { CompanyAccessModule } from '../auth/company-access.module'

import { RealtimeGateway } from './realtime.gateway'
import { RealtimeService } from './realtime.service'

@Module({
  imports: [CompanyAccessModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService]
})
export class RealtimeModule {}

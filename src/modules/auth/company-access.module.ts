import { Module } from '@nestjs/common'

import { CompanyAccessGuard } from './company-access.guard'
import { CompanyAccessService } from './company-access.service'

@Module({
  providers: [CompanyAccessService, CompanyAccessGuard],
  exports: [CompanyAccessService, CompanyAccessGuard]
})
export class CompanyAccessModule {}

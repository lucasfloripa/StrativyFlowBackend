import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { CompanyController } from './company.controller'
import { Company } from './company.entity'
import { CompanyService } from './company.service'

@Module({
  imports: [TypeOrmModule.forFeature([Company, UserInformations])],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService]
})
export class CompanyModule {}

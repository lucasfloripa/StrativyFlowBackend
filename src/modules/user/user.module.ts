import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserInformations } from './entities/user-informations.entity'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  imports: [TypeOrmModule.forFeature([UserInformations])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService, TypeOrmModule]
})
export class UserModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { Contact } from './contact.entity'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  imports: [TypeOrmModule.forFeature([Contact, UserInformations])],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService]
})
export class ContactsModule {}

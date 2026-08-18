import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { ContactsService } from './contacts.service'
import { CreateContactDto } from './dto/create-contact.dto'
import { UpdateContactDto } from './dto/update-contact.dto'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(
    @Body() createContactDto: CreateContactDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.contactsService.create(request.user.id, createContactDto)
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.contactsService.findAll(request.user.id)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.contactsService.findOne(request.user.id, id)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.contactsService.update(request.user.id, id, updateContactDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.contactsService.remove(request.user.id, id)
  }
}

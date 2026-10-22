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

import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { CreateMessageTemplateDto } from '../dto/create-message-template.dto'
import { UpdateMessageTemplateDto } from '../dto/update-message-template.dto'
import { MessageTemplateService } from '../services/message-template.service'

import type { Request } from 'express'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('message-templates')
@UseGuards(JwtAuthGuard)
export class MessageTemplateController {
  constructor(
    private readonly messageTemplateService: MessageTemplateService
  ) {}

  @Post()
  async create(
    @Body() dto: CreateMessageTemplateDto,
    @Req() request: AuthenticatedRequest
  ) {
    return await this.messageTemplateService.create(dto, request.user.id)
  }

  @Get()
  async findAll(@Req() request: AuthenticatedRequest) {
    return await this.messageTemplateService.findAll(request.user.id)
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return await this.messageTemplateService.findOne(id, request.user.id)
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
    @Req() request: AuthenticatedRequest
  ) {
    return await this.messageTemplateService.update(id, dto, request.user.id)
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return await this.messageTemplateService.remove(id, request.user.id)
  }
}

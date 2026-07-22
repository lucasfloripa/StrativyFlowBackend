import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'

import { CreateMessageTemplateDto } from '../dto/create-message-template.dto'
import { UpdateMessageTemplateDto } from '../dto/update-message-template.dto'
import { MessageTemplateService } from '../services/message-template.service'

@Controller('message-templates')
export class MessageTemplateController {
  constructor(
    private readonly messageTemplateService: MessageTemplateService
  ) {}

  @Post()
  async create(@Body() dto: CreateMessageTemplateDto) {
    return await this.messageTemplateService.create(dto)
  }

  @Get()
  async findAll() {
    return await this.messageTemplateService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.messageTemplateService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return await this.messageTemplateService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.messageTemplateService.remove(id)
  }
}
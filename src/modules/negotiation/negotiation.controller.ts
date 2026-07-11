import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post
} from '@nestjs/common'

import { CreateNegotiationDto } from './dto/create-negotiation.dto'
import { UpdateNegotiationDto } from './dto/update-negotiation.dto'
import { NegotiationService } from './negotiation.service'

@Controller('negotiations')
export class NegotiationController {
  constructor(private readonly negotiationService: NegotiationService) {}

  @Post()
  async create(@Body() dto: CreateNegotiationDto) {
    return await this.negotiationService.create(dto)
  }

  @Get()
  async findAll() {
    return await this.negotiationService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.negotiationService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNegotiationDto) {
    return await this.negotiationService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.negotiationService.remove(id)
  }
}
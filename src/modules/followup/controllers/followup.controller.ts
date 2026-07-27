import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post
} from '@nestjs/common'

import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import { FollowUpService } from '../services/followup.service'

@Controller('followups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Post()
  async create(@Body() dto: CreateFollowUpDto) {
    return await this.followUpService.create(dto)
  }

  @Get()
  async findAll() {
    return await this.followUpService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.followUpService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto) {
    return await this.followUpService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.followUpService.remove(id)
  }
}

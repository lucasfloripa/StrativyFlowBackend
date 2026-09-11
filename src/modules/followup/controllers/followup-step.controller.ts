import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common'

import { CreateFollowUpStepTreeDto } from '../dto/create-followup-step-tree.dto'
import { CreateFollowUpStepDto } from '../dto/create-followup-step.dto'
import { FollowUpStepResponseDto } from '../dto/followup-response.dto'
import { UpdateFollowUpStepDto } from '../dto/update-followup-step.dto'
import { FollowUpStepService } from '../services/followup-step.service'

@Controller('followup-steps')
export class FollowUpStepController {
  constructor(private readonly followUpStepService: FollowUpStepService) {}

  @Post()
  async create(@Body() dto: CreateFollowUpStepDto) {
    return await this.followUpStepService.create(dto)
  }

  @Post('tree')
  async createTree(@Body() dto: CreateFollowUpStepTreeDto): Promise<{
    followUpId: string
    steps: Array<{ clientId: string; step: FollowUpStepResponseDto }>
  }> {
    return await this.followUpStepService.createTree(dto)
  }

  @Get()
  async findAll(@Query('followUpId') followUpId?: string) {
    return await this.followUpStepService.findAll(followUpId)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.followUpStepService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFollowUpStepDto) {
    return await this.followUpStepService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.followUpStepService.remove(id)
  }
}

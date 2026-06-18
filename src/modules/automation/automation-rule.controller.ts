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

import { AutomationRuleService } from './automation-rule.service'
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto'
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto'

@Controller('automation-rules')
export class AutomationRuleController {
  constructor(private readonly automationRuleService: AutomationRuleService) {}

  @Get()
  async findAll(@Query('boardId') boardId: string) {
    return await this.automationRuleService.findAll(boardId)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.automationRuleService.findOne(id)
  }

  @Post()
  async create(@Body() dto: CreateAutomationRuleDto) {
    return await this.automationRuleService.create(dto)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return await this.automationRuleService.update(id, dto)
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string) {
    return await this.automationRuleService.deactivate(id)
  }
}

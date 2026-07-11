import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto'
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto'
import { AutomationRule } from './entities/automation-rule.entity'

@Injectable()
export class AutomationRuleService {
  constructor(
    @InjectRepository(AutomationRule)
    private readonly automationRuleRepo: Repository<AutomationRule>
  ) {}

  async create(dto: CreateAutomationRuleDto): Promise<AutomationRule> {
    if (!dto.actions?.length) {
      throw new BadRequestException(
        'Automation rule must contain at least one action'
      )
    }

    const rule = this.automationRuleRepo.create({
      name: dto.name,
      triggerType: dto.triggerType,
      conditions: dto.conditions ?? {},
      actions: dto.actions,
      isActive: dto.isActive ?? true
    })

    return await this.automationRuleRepo.save(rule)
  }

  async findAll(): Promise<AutomationRule[]> {
    return await this.automationRuleRepo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' }
    })
  }

  async findOne(id: string): Promise<AutomationRule> {
    const rule = await this.automationRuleRepo.findOne({
      where: { id }
    })

    if (!rule) {
      throw new NotFoundException(`Automation rule ${id} not found`)
    }

    return rule
  }

  async update(
    id: string,
    dto: UpdateAutomationRuleDto
  ): Promise<AutomationRule> {
    if (dto.actions && dto.actions.length === 0) {
      throw new BadRequestException(
        'Automation rule must contain at least one action'
      )
    }

    const rule = await this.findOne(id)

    if (dto.name !== undefined) rule.name = dto.name
    if (dto.triggerType !== undefined) rule.triggerType = dto.triggerType
    if (dto.actions !== undefined) rule.actions = dto.actions
    if (dto.conditions !== undefined) rule.conditions = dto.conditions
    if (dto.isActive !== undefined) rule.isActive = dto.isActive

    return await this.automationRuleRepo.save(rule)
  }

  async deactivate(id: string): Promise<AutomationRule> {
    const rule = await this.findOne(id)

    rule.isActive = false

    return await this.automationRuleRepo.save(rule)
  }
}

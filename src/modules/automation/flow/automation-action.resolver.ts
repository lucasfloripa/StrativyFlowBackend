import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Lead, LeadRuntimeMode } from '../../leads/entities/lead.entity'
import { AutomationRule } from '../entities/automation-rule.entity'

import { AutomationAction } from './automation-action.types'
import { AutomationTriggerContext } from './automation-trigger.types'

@Injectable()
export class AutomationActionResolver {
  constructor(
    @InjectRepository(AutomationRule)
    private readonly automationRuleRepo: Repository<AutomationRule>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>
  ) {}

  private readonly logger = new Logger(AutomationActionResolver.name)

  private async resolveRuntimeModeFromContext(
    context: AutomationTriggerContext
  ): Promise<LeadRuntimeMode | null> {
    const rawMetadataRuntimeMode = context.metadata?.runtimeMode
    if (
      rawMetadataRuntimeMode === LeadRuntimeMode.HUMAN ||
      rawMetadataRuntimeMode === LeadRuntimeMode.AUTOMATION
    ) {
      return rawMetadataRuntimeMode
    }

    const lead = await this.leadRepo.findOne({
      where: { id: context.leadId }
    })

    return lead?.runtimeMode ?? null
  }

  private matchesRuleConditions(
    rule: AutomationRule,
    context: AutomationTriggerContext,
    runtimeMode: LeadRuntimeMode | null
  ): boolean {
    const rawConditions = rule.conditions as unknown
    const conditionsRecord =
      rawConditions && typeof rawConditions === 'object'
        ? (rawConditions as Record<string, unknown>)
        : null

    const rawMessageContains = conditionsRecord?.messageContains
    const configuredMessageContains =
      typeof rawMessageContains === 'string' ? rawMessageContains.trim() : ''

    if (!configuredMessageContains) {
      // continue with other conditions when messageContains is not configured
    } else {
      const messageText =
        typeof context.metadata?.messageText === 'string'
          ? context.metadata.messageText
          : ''

      const messageContainsMatched = messageText
        .toLowerCase()
        .includes(configuredMessageContains.toLowerCase())

      if (messageContainsMatched) {
        this.logger.log(
          `Automation rule condition matched: ${rule.id} messageContains="${configuredMessageContains}"`
        )
      } else {
        this.logger.log(
          `Automation rule condition failed: ${rule.id} messageContains="${configuredMessageContains}"`
        )
        return false
      }
    }

    const rawRuntimeMode = conditionsRecord?.runtimeMode
    const configuredRuntimeMode =
      rawRuntimeMode === LeadRuntimeMode.HUMAN ||
      rawRuntimeMode === LeadRuntimeMode.AUTOMATION
        ? rawRuntimeMode
        : null

    if (!configuredRuntimeMode) {
      return true
    }

    if (!runtimeMode) {
      this.logger.log(
        `Automation rule runtimeMode condition failed: ${rule.id} expected=${configuredRuntimeMode} actual=unknown`
      )
      return false
    }

    const runtimeModeMatched = runtimeMode === configuredRuntimeMode

    if (runtimeModeMatched) {
      this.logger.log(
        `Automation rule runtimeMode condition matched: ${rule.id} runtimeMode=${configuredRuntimeMode}`
      )
    } else {
      this.logger.log(
        `Automation rule runtimeMode condition failed: ${rule.id} expected=${configuredRuntimeMode} actual=${runtimeMode}`
      )
    }

    return runtimeModeMatched
  }

  async resolve(
    context: AutomationTriggerContext
  ): Promise<AutomationAction[]> {
    const matchedRules = await this.automationRuleRepo.find({
      where: {
        triggerType: context.triggerType,
        isActive: true
      }
    })

    matchedRules.forEach((rule) => {
      this.logger.log(`Automation rule loaded: ${rule.id} (${rule.name})`)
    })

    const runtimeMode = await this.resolveRuntimeModeFromContext(context)

    const conditionMatchedRules = matchedRules.filter((rule) =>
      this.matchesRuleConditions(rule, context, runtimeMode)
    )

    const resolvedActions = conditionMatchedRules.flatMap(
      (rule) => rule.actions ?? []
    )

    this.logger.log(
      `Automation rules matched: ${conditionMatchedRules.length} for trigger ${context.triggerType}`
    )
    this.logger.log(`Automation actions resolved: ${resolvedActions.length}`)

    return resolvedActions
  }
}

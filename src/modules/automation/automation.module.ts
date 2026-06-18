import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'

import { AutomationRuleController } from './automation-rule.controller'
import { AutomationRuleService } from './automation-rule.service'
import { AutomationRule } from './entities/automation-rule.entity'
import { AutomationActionExecutor } from './flow/automation-action.executor'
import { AutomationActionResolver } from './flow/automation-action.resolver'
import { AutomationTriggerDispatcher } from './flow/automation-trigger.dispatcher'
import { AutomationMessagingService } from './services/automation-messaging.service'

@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule, Lead, Message])],
  providers: [
    AutomationRuleService,
    AutomationActionResolver,
    AutomationActionExecutor,
    AutomationTriggerDispatcher,
    AutomationMessagingService
  ],
  controllers: [AutomationRuleController],
  exports: [
    TypeOrmModule,
    AutomationRuleService,
    AutomationActionResolver,
    AutomationActionExecutor,
    AutomationTriggerDispatcher,
    AutomationMessagingService
  ]
})
export class AutomationModule {}

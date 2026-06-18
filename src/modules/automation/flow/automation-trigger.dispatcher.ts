import { Injectable, Logger } from '@nestjs/common'

import { AutomationActionExecutor } from './automation-action.executor'
import { AutomationActionResolver } from './automation-action.resolver'
import { AutomationTriggerContext } from './automation-trigger.types'

@Injectable()
export class AutomationTriggerDispatcher {
  private readonly logger = new Logger(AutomationTriggerDispatcher.name)

  constructor(
    private readonly automationActionResolver: AutomationActionResolver,
    private readonly automationActionExecutor: AutomationActionExecutor
  ) {}

  async dispatch(context: AutomationTriggerContext): Promise<void> {
    this.logger.log(
      `Executing automation trigger ${context.triggerType} for lead ${context.leadId} on board ${context.boardId} [correlationId=${context.correlationId}]`
    )

    const resolvedActions = await this.automationActionResolver.resolve(context)

    this.logger.debug(
      `Resolved ${resolvedActions.length} automation action(s) for trigger ${context.triggerType}`
    )

    await this.automationActionExecutor.execute(resolvedActions, context)
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { NegotiationStage } from '../../negotiation/entities/negotiation.entity'
import {
  FollowUpAction,
  FollowUpActionChannel,
  FollowUpActionStatus
} from '../entities/followup-action.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { FollowUpActionExecutor } from './followup-action-executor.service'

@Injectable()
export class FollowUpExecutor {
  private readonly logger = new Logger(FollowUpExecutor.name)

  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    @InjectRepository(FollowUpAction)
    private readonly followUpActionRepository: Repository<FollowUpAction>,
    private readonly followUpActionExecutor: FollowUpActionExecutor
  ) {}

  async findReadyForExecution(
    referenceDate: Date = new Date()
  ): Promise<FollowUp[]> {
    const executableFollowUps = await this.followUpRepository
      .createQueryBuilder('followUp')
      .innerJoinAndSelect('followUp.negotiation', 'negotiation')
      .innerJoinAndSelect('negotiation.lead', 'lead')
      .innerJoinAndSelect(
        'followUp.actions',
        'action',
        'action.status = :pendingActionStatus AND (action.channel IS NULL OR action.channel != :agendaChannel)',
        {
          pendingActionStatus: FollowUpActionStatus.PENDING,
          agendaChannel: FollowUpActionChannel.AGENDA
        }
      )
      .where('followUp.status = :pendingStatus', {
        pendingStatus: FollowUpStatus.PENDING
      })
      .andWhere('"followUp"."dueAt" <= :referenceDate', {
        referenceDate
      })
      .andWhere('negotiation.stage NOT IN (:...closedStages)', {
        closedStages: [NegotiationStage.WON, NegotiationStage.LOST]
      })
      .andWhere('"negotiation"."closedAt" IS NULL')
      .orderBy('"followUp"."dueAt"', 'ASC')
      .addOrderBy('"followUp"."createdAt"', 'ASC')
      .getMany()

    if (executableFollowUps.length > 0) {
      this.logger.debug(
        `Found ${executableFollowUps.length} executable follow-ups at ${referenceDate.toISOString()}`
      )
    }

    return executableFollowUps
  }

  // Backward-compatible alias while callers migrate to findReadyForExecution.
  async findExecutableFollowUps(
    referenceDate: Date = new Date()
  ): Promise<FollowUp[]> {
    return await this.findReadyForExecution(referenceDate)
  }

  async execute(followUp: FollowUp): Promise<void> {
    const lead = followUp.negotiation?.lead

    if (!lead) {
      throw new Error(`Lead not loaded for FollowUp ${followUp.id}`)
    }

    for (const loadedAction of followUp.actions ?? []) {
      const action = await this.followUpActionRepository.findOne({
        where: {
          id: loadedAction.id,
          status: FollowUpActionStatus.PENDING
        }
      })

      if (!action) {
        continue
      }

      if (action.channel === FollowUpActionChannel.AGENDA) {
        continue
      }

      this.logger.log(
        `Executing follow-up action. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, actionId=${action.id}, actionType=${action.type}, channel=${action.channel ?? 'none'}`
      )

      try {
        const status = await this.followUpActionExecutor.execute(
          action,
          lead,
          followUp.negotiationId
        )

        action.status = status
        action.executedAt =
          status === FollowUpActionStatus.EXECUTED ? new Date() : null
        action.failureReason = null
        await this.followUpActionRepository.save(action)
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown execution error'

        action.status = FollowUpActionStatus.FAILED
        action.executedAt = null
        action.failureReason = message
        await this.followUpActionRepository.save(action)

        this.logger.error(
          `Failed to execute follow-up action. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, actionId=${action.id}, actionType=${action.type}, channel=${action.channel ?? 'none'}, error=${message}`,
          error instanceof Error ? error.stack : undefined
        )
      }
    }

    await this.updateFollowUpCompletion(followUp.id)
  }

  private async updateFollowUpCompletion(followUpId: string): Promise<void> {
    const actions = await this.followUpActionRepository.find({
      where: { followUpId }
    })
    const isCompleted = actions.every(
      (action) =>
        action.status === FollowUpActionStatus.EXECUTED ||
        action.status === FollowUpActionStatus.SKIPPED
    )

    if (!isCompleted) {
      return
    }

    await this.followUpRepository.update(followUpId, {
      status: FollowUpStatus.DONE,
      completedAt: new Date()
    })
  }
}

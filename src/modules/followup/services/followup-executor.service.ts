import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { NegotiationStage } from '../../negotiation/entities/negotiation.entity'
import { FollowUp, FollowUpStatus } from '../entities/followup.entity'

import { FollowUpTemplateCommandMapper } from './followup-template-command.mapper'
import { WhatsAppTemplateSender } from './whatsapp-template-sender.service'

@Injectable()
export class FollowUpExecutor {
  private readonly logger = new Logger(FollowUpExecutor.name)

  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    private readonly followUpTemplateCommandMapper: FollowUpTemplateCommandMapper,
    private readonly whatsAppTemplateSender: WhatsAppTemplateSender
  ) {}

  async findReadyForExecution(
    referenceDate: Date = new Date()
  ): Promise<FollowUp[]> {
    const executableFollowUps = await this.followUpRepository
      .createQueryBuilder('followUp')
      .innerJoinAndSelect('followUp.negotiation', 'negotiation')
      .innerJoinAndSelect('negotiation.lead', 'lead')
      .innerJoinAndSelect('followUp.template', 'template')
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

  async canExecute(followUp: FollowUp): Promise<boolean> {
    const hasPhone = Boolean(followUp.negotiation?.lead?.phone?.trim())
    const hasMetaTemplateName = Boolean(
      followUp.template?.metaTemplateName?.trim()
    )

    if (!hasPhone || !hasMetaTemplateName) {
      this.logger.warn(
        `Skipping follow-up execution due to missing payload fields. followUpId=${followUp.id}, leadId=${followUp.negotiation?.leadId ?? 'null'}, hasPhone=${hasPhone}, hasMetaTemplateName=${hasMetaTemplateName}`
      )
      return false
    }

    return true
  }

  isLeadInActiveConversation(followUp: FollowUp, referenceDate: Date = new Date()): boolean {
    const lastActivityAt = followUp.negotiation?.lead?.lastActivityAt
    if (!lastActivityAt) {
      return false
    }

    const hoursSinceLastActivity = (referenceDate.getTime() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60)
    const isInActiveConversation = hoursSinceLastActivity < 24

    if (isInActiveConversation) {
      this.logger.debug(
        `Lead is in active conversation (within 24h). followUpId=${followUp.id}, leadId=${followUp.negotiation?.leadId ?? 'null'}, lastActivityAt=${lastActivityAt.toISOString()}, hoursSince=${hoursSinceLastActivity.toFixed(2)}`
      )
    }

    return isInActiveConversation
  }

  async execute(followUp: FollowUp): Promise<void> {
    const canExecuteFollowUp = await this.canExecute(followUp)

    if (!canExecuteFollowUp) {
      return
    }

    this.logger.debug(
      `Preparing WhatsApp template command. followUpId=${followUp.id}, negotiationId=${followUp.negotiationId}, templateId=${followUp.templateId ?? 'null'}`
    )

    const sendTemplateCommand =
      this.followUpTemplateCommandMapper.toSendWhatsAppTemplateCommand(followUp)

    await this.whatsAppTemplateSender.sendTemplate(sendTemplateCommand)

    await this.followUpRepository.update(followUp.id, {
      status: FollowUpStatus.DONE,
      completedAt: new Date()
    })
  }
}

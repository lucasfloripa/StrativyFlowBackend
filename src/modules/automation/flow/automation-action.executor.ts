import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'
import { Lead, LeadRuntimeMode } from '../../leads/entities/lead.entity'
import { LeadChannelIdentityService } from '../../leads/services/lead-channel-identity.service'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { AutomationMessagingService } from '../services/automation-messaging.service'

import {
  AutomationAction,
  AutomationActionType
} from './automation-action.types'
import { AutomationTriggerContext } from './automation-trigger.types'

@Injectable()
export class AutomationActionExecutor {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    private readonly automationMessagingService: AutomationMessagingService,
    private readonly leadChannelIdentityService: LeadChannelIdentityService
  ) {}

  private readonly logger = new Logger(AutomationActionExecutor.name)

  async execute(
    actions: AutomationAction[],
    context?: AutomationTriggerContext
  ): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case AutomationActionType.SEND_MESSAGE: {
          this.logger.log('Executing automation action SEND_MESSAGE')

          const content =
            typeof action.payload?.content === 'string'
              ? action.payload.content.trim()
              : ''

          if (!content) {
            this.logger.warn(
              'Skipping SEND_MESSAGE action because content is missing'
            )
            break
          }

          const leadId = context?.leadId
          if (!leadId) {
            this.logger.warn(
              'Skipping SEND_MESSAGE action because leadId is missing from trigger context'
            )
            break
          }

          const lead = await this.leadRepo.findOne({
            where: { id: leadId }
          })

          if (!lead) {
            this.logger.warn(
              `Skipping SEND_MESSAGE action because lead ${leadId} was not found`
            )
            break
          }

          const userInformations = lead.userInformationsId
            ? await this.userInformationsRepo.findOne({
                where: { id: lead.userInformationsId }
              })
            : null

          const whatsappIdentity =
            await this.leadChannelIdentityService.findLatestIdentityForLead(
              lead.id,
              LeadChannel.WHATSAPP
            )

          const phoneNumberId =
            typeof context?.metadata?.phoneNumberId === 'string'
              ? context.metadata.phoneNumberId
              : whatsappIdentity?.externalAccountId

          const whatsappToken = userInformations?.whatsappToken ?? undefined
          const destinationPhone =
            (typeof context?.metadata?.from === 'string'
              ? context.metadata.from.trim()
              : '') ||
            whatsappIdentity?.externalUserId.trim() ||
            lead.phone?.trim()

          if (!destinationPhone) {
            this.logger.warn(
              `Skipping SEND_MESSAGE action because lead ${lead.id} has no WhatsApp phone`
            )
            break
          }

          this.logger.log(
            `Dispatching automation WhatsApp message. leadId=${lead.id} phone=${destinationPhone} content=${content}`
          )

          const response =
            await this.automationMessagingService.sendWhatsAppMessage(
              destinationPhone,
              content,
              phoneNumberId,
              whatsappToken
            )

          const whatsappMessageId = response?.data?.messages?.[0]?.id ?? null

          await this.automationMessagingService.persistOutboundMessage({
            correlationId: context?.correlationId,
            leadId: lead.id,
            content,
            whatsappMessageId
          })

          this.logger.log(
            `Automation WhatsApp message sent. leadId=${lead.id} phone=${destinationPhone} content=${content} whatsappMessageId=${whatsappMessageId ?? 'unknown'}`
          )

          break
        }
        case AutomationActionType.CREATE_FOLLOWUP:
          this.logger.log('Executing automation action CREATE_FOLLOWUP')
          break
        case AutomationActionType.SET_RUNTIME_MODE: {
          this.logger.log('Executing automation action SET_RUNTIME_MODE')

          const runtimeMode = action.payload?.runtimeMode

          if (
            runtimeMode !== LeadRuntimeMode.HUMAN &&
            runtimeMode !== LeadRuntimeMode.AUTOMATION
          ) {
            this.logger.warn(
              `Skipping SET_RUNTIME_MODE action due to invalid runtimeMode: ${String(runtimeMode)}`
            )
            break
          }

          const leadId = context?.leadId
          if (!leadId) {
            this.logger.warn(
              'Skipping SET_RUNTIME_MODE action because leadId is missing from trigger context'
            )
            break
          }

          const lead = await this.leadRepo.findOne({
            where: { id: leadId }
          })

          if (!lead) {
            this.logger.warn(
              `Skipping SET_RUNTIME_MODE action because lead ${leadId} was not found`
            )
            break
          }

          const previousRuntimeMode = lead.runtimeMode
          lead.runtimeMode = runtimeMode
          lead.lastActivityAt = new Date()
          await this.leadRepo.save(lead)

          this.logger.log(
            `Lead runtime mode changed: ${previousRuntimeMode} -> ${runtimeMode} (leadId=${lead.id})`
          )
          break
        }
        case AutomationActionType.TAG_LEAD:
          this.logger.log('Executing automation action TAG_LEAD')
          break
        default:
          this.logger.warn('Unknown automation action type')
          break
      }
    }
  }
}

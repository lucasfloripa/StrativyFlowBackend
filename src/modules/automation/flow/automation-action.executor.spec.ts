import { Repository } from 'typeorm'

import { Company } from '../../company/company.entity'
import { Lead } from '../../leads/entities/lead.entity'
import { LeadChannelIdentityService } from '../../leads/services/lead-channel-identity.service'
import { AutomationMessagingService } from '../services/automation-messaging.service'

import { AutomationActionExecutor } from './automation-action.executor'
import { AutomationActionType } from './automation-action.types'
import {
  AutomationTriggerContext,
  AutomationTriggerType
} from './automation-trigger.types'

describe('AutomationActionExecutor Company WhatsApp credentials', () => {
  const createExecutor = (options?: {
    company?: Company | null
    identityAccountId?: string
  }) => {
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1',
      phone: '5548999999999'
    })
    const company =
      options?.company === undefined
        ? Object.assign(new Company(), {
            id: 'company-1',
            companyPhoneNumberId: 'company-phone-id',
            whatsappToken: 'company-token'
          })
        : options.company
    const leadRepo = { findOne: jest.fn().mockResolvedValue(lead) }
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const identityService = {
      findLatestIdentityForLead: jest.fn().mockResolvedValue(
        options?.identityAccountId
          ? {
              externalAccountId: options.identityAccountId,
              externalUserId: '5548888888888'
            }
          : null
      )
    }
    const messagingService = {
      sendWhatsAppMessage: jest
        .fn()
        .mockResolvedValue({ data: { messages: [{ id: 'wamid-1' }] } }),
      persistOutboundMessage: jest.fn().mockResolvedValue(undefined)
    }
    const executor = new AutomationActionExecutor(
      leadRepo as unknown as Repository<Lead>,
      companyRepo as unknown as Repository<Company>,
      messagingService as unknown as AutomationMessagingService,
      identityService as unknown as LeadChannelIdentityService
    )
    const context: AutomationTriggerContext = {
      triggerType: AutomationTriggerType.ON_MESSAGE_RECEIVED,
      leadId: lead.id,
      correlationId: 'correlation-1',
      metadata: { from: '5548777777777', phoneNumberId: 'company-phone-id' }
    }
    const action = {
      type: AutomationActionType.SEND_MESSAGE,
      payload: { content: ' Reply from automation ' }
    }
    return {
      executor,
      lead,
      company,
      leadRepo,
      companyRepo,
      identityService,
      messagingService,
      context,
      action
    }
  }

  it('sends and persists automation replies with the Company account token', async () => {
    const dependencies = createExecutor()

    await dependencies.executor.execute(
      [dependencies.action],
      dependencies.context
    )

    expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'company-1' }
    })
    expect(
      dependencies.messagingService.sendWhatsAppMessage
    ).toHaveBeenCalledWith(
      '5548777777777',
      'Reply from automation',
      'company-phone-id',
      'company-token'
    )
    expect(
      dependencies.messagingService.persistOutboundMessage
    ).toHaveBeenCalledWith({
      correlationId: 'correlation-1',
      leadId: 'lead-1',
      content: 'Reply from automation',
      whatsappMessageId: 'wamid-1'
    })
  })

  it('uses the Company channel identity when webhook context has no phone number ID', async () => {
    const dependencies = createExecutor({
      identityAccountId: 'company-phone-id'
    })
    dependencies.context.metadata = { from: '5548777777777' }

    await dependencies.executor.execute(
      [dependencies.action],
      dependencies.context
    )

    expect(
      dependencies.messagingService.sendWhatsAppMessage
    ).toHaveBeenCalledWith(
      '5548777777777',
      'Reply from automation',
      'company-phone-id',
      'company-token'
    )
  })

  it.each([
    ['missing Company', { company: null }],
    [
      'missing Company token',
      {
        company: Object.assign(new Company(), {
          id: 'company-1',
          companyPhoneNumberId: 'company-phone-id'
        })
      }
    ],
    [
      'missing Company number ID',
      {
        company: Object.assign(new Company(), {
          id: 'company-1',
          whatsappToken: 'company-token'
        })
      }
    ],
    ['different identity account', { identityAccountId: 'another-phone-id' }]
  ])('does not send when %s', async (_reason, options) => {
    const dependencies = createExecutor(options)

    await dependencies.executor.execute(
      [dependencies.action],
      dependencies.context
    )

    expect(
      dependencies.messagingService.sendWhatsAppMessage
    ).not.toHaveBeenCalled()
    expect(
      dependencies.messagingService.persistOutboundMessage
    ).not.toHaveBeenCalled()
  })

  it('skips sending when the lead is no longer available', async () => {
    const dependencies = createExecutor()
    dependencies.leadRepo.findOne.mockResolvedValue(null)

    await dependencies.executor.execute(
      [dependencies.action],
      dependencies.context
    )

    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
    expect(
      dependencies.messagingService.sendWhatsAppMessage
    ).not.toHaveBeenCalled()
  })
})

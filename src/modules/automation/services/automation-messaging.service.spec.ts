import { Repository } from 'typeorm'

import { LeadRuntimeMode } from '../../leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageType
} from '../../leads/entities/message.entity'

import { AutomationMessagingService } from './automation-messaging.service'

describe('AutomationMessagingService', () => {
  it('marks persisted outbound messages as automation generated', async () => {
    const messageRepo = {
      create: jest.fn((message: Partial<Message>) => message),
      save: jest.fn((message: Partial<Message>) => Promise.resolve(message))
    }
    const service = new AutomationMessagingService(
      messageRepo as unknown as Repository<Message>
    )

    await service.persistOutboundMessage({
      leadId: 'lead-1',
      content: 'Olá! Como podemos ajudar?',
      whatsappMessageId: 'wamid-1'
    })

    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.WHATSAPP,
        content: 'Olá! Como podemos ajudar?',
        type: MessageType.TEXT,
        externalMessageId: 'wamid-1',
        metadata: {
          runtimeMode: LeadRuntimeMode.AUTOMATION
        }
      })
    )
  })
})

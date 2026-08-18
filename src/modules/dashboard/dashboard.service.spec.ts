import { Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { Lead, LeadRuntimeMode } from '../leads/entities/lead.entity'
import { MessageDirection, MessageType } from '../leads/entities/message.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { DashboardService } from './dashboard.service'
import { DashboardConversationFilter } from './dto/dashboard-conversations-query.dto'

describe('DashboardService conversations', () => {
  let service: DashboardService
  let leadRepo: jest.Mocked<Pick<Repository<Lead>, 'query'>>
  let userInformationsRepo: jest.Mocked<
    Pick<Repository<UserInformations>, 'find'>
  >

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T15:00:00.000Z'))

    leadRepo = {
      query: jest.fn()
    }
    userInformationsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'mapping-1' }])
    }

    service = new DashboardService(
      leadRepo as unknown as Repository<Lead>,
      {} as Repository<FollowUp>,
      userInformationsRepo as unknown as Repository<UserInformations>
    )

    leadRepo.query.mockResolvedValue([
      {
        leadId: 'recent-unanswered',
        leadName: 'Lead novo',
        source: 'Meta Ads',
        leadCreatedAt: '2026-08-08T12:00:00.000Z',
        lastMessageAt: '2026-08-08T12:10:00.000Z',
        lastMessage: 'Quero mais informações',
        lastMessageDirection: MessageDirection.INBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T12:10:00.000Z',
        hasOutbound: false,
        runtimeMode: LeadRuntimeMode.AUTOMATION
      },
      {
        leadId: 'recent-answered',
        leadName: 'Lead respondido',
        source: 'WhatsApp',
        leadCreatedAt: '2026-08-05T16:00:00.000Z',
        lastMessageAt: '2026-08-05T20:00:00.000Z',
        lastMessage: 'Olá, como posso ajudar?',
        lastMessageDirection: MessageDirection.OUTBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-05T17:00:00.000Z',
        hasOutbound: true,
        runtimeMode: LeadRuntimeMode.HUMAN
      },
      {
        leadId: 'recent-automation-replied',
        leadName: 'Lead com resposta automática',
        source: 'WhatsApp',
        leadCreatedAt: '2026-08-08T14:00:00.000Z',
        lastMessageAt: '2026-08-08T14:01:00.000Z',
        lastMessage: 'Olá! Como podemos ajudar?',
        lastMessageDirection: MessageDirection.AUTOMATIC,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T14:00:00.000Z',
        hasOutbound: false,
        runtimeMode: LeadRuntimeMode.AUTOMATION
      },
      {
        leadId: 'old-open-window',
        leadName: 'Janela aberta',
        source: 'Google Ads',
        leadCreatedAt: '2026-08-06T10:00:00.000Z',
        lastMessageAt: '2026-08-08T10:00:00.000Z',
        lastMessage: 'Mensagem recebida hoje',
        lastMessageDirection: MessageDirection.INBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T10:00:00.000Z',
        hasOutbound: true,
        runtimeMode: LeadRuntimeMode.HUMAN
      },
      {
        leadId: 'returning-unanswered',
        leadName: 'Lead antigo que voltou a falar',
        source: 'Instagram',
        leadCreatedAt: '2026-07-08T10:00:00.000Z',
        lastMessageAt: '2026-08-08T11:00:00.000Z',
        lastMessage: 'Olá olá olá',
        lastMessageDirection: MessageDirection.INBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T11:00:00.000Z',
        hasOutbound: false,
        runtimeMode: LeadRuntimeMode.AUTOMATION
      },
      {
        leadId: 'established-open-window',
        leadName: 'Lead com janela aberta',
        source: 'WhatsApp',
        leadCreatedAt: '2026-08-05T09:00:00.000Z',
        lastMessageAt: '2026-08-08T10:00:00.000Z',
        lastMessage: 'Mensagem recebida nas últimas 24h',
        lastMessageDirection: MessageDirection.INBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T10:00:00.000Z',
        hasOutbound: true,
        runtimeMode: LeadRuntimeMode.HUMAN
      },
      {
        leadId: 'old-expired-window',
        leadName: 'Sem inbound recente',
        source: 'Indicação',
        leadCreatedAt: '2026-08-04T10:00:00.000Z',
        lastMessageAt: '2026-08-08T14:00:00.000Z',
        lastMessage: 'Última mensagem foi outbound',
        lastMessageDirection: MessageDirection.OUTBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-06T14:00:00.000Z',
        hasOutbound: true,
        runtimeMode: LeadRuntimeMode.AUTOMATION
      },
      {
        leadId: 'old-automation-only',
        leadName: 'Lead atendido apenas pela automação',
        source: 'Messenger',
        leadCreatedAt: '2026-08-04T09:00:00.000Z',
        lastMessageAt: '2026-08-06T15:00:00.000Z',
        lastMessage: 'Resposta automática',
        lastMessageDirection: MessageDirection.AUTOMATIC,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-06T14:00:00.000Z',
        hasOutbound: false,
        runtimeMode: LeadRuntimeMode.AUTOMATION
      }
    ])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('orders new conversations first and then leads from newest to oldest', async () => {
    const result = await service.getConversations(
      'user-1',
      DashboardConversationFilter.ALL
    )

    expect(result.items.map((item) => item.leadId)).toEqual([
      'recent-automation-replied',
      'recent-unanswered',
      'returning-unanswered',
      'old-open-window',
      'recent-answered',
      'established-open-window',
      'old-expired-window',
      'old-automation-only'
    ])
    expect(result.counts).toEqual({
      all: 8,
      new: 3,
      today: 2,
      noResponse24h: 3
    })
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        isNew: true,
        status: 'new',
        runtimeMode: LeadRuntimeMode.AUTOMATION,
        lastMessageAt: new Date('2026-08-08T14:01:00.000Z'),
        lastMessageDirection: MessageDirection.AUTOMATIC
      })
    )
    expect(result.items.map((item) => [item.leadId, item.status])).toEqual([
      ['recent-automation-replied', 'new'],
      ['recent-unanswered', 'new'],
      ['returning-unanswered', 'new'],
      ['old-open-window', 'today'],
      ['recent-answered', 'noResponse24h'],
      ['established-open-window', 'today'],
      ['old-expired-window', 'noResponse24h'],
      ['old-automation-only', 'noResponse24h']
    ])
  })

  it.each([
    [
      DashboardConversationFilter.NEW,
      ['recent-automation-replied', 'recent-unanswered', 'returning-unanswered']
    ],
    [
      DashboardConversationFilter.TODAY,
      ['old-open-window', 'established-open-window']
    ],
    [
      DashboardConversationFilter.NO_RESPONSE_24H,
      ['recent-answered', 'old-expired-window', 'old-automation-only']
    ]
  ])('filters conversations by %s', async (filter, expectedLeadIds) => {
    const result = await service.getConversations('user-1', filter)

    expect(result.items.map((item) => item.leadId)).toEqual(expectedLeadIds)
  })
})

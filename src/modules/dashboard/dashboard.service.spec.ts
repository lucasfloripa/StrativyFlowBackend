import { Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { Lead, LeadRuntimeMode, LeadState } from '../leads/entities/lead.entity'
import {
  MessageDirection,
  MessageStatus,
  MessageType
} from '../leads/entities/message.entity'
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
        leadName: null,
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
        leadState: LeadState.ARCHIVED,
        source: 'WhatsApp',
        leadCreatedAt: '2026-08-05T16:00:00.000Z',
        lastMessageAt: '2026-08-05T20:00:00.000Z',
        lastMessage: 'Olá, como posso ajudar?',
        lastMessageDirection: MessageDirection.OUTBOUND,
        lastMessageStatus: MessageStatus.READ,
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
        leadId: 'recent-human-answered',
        leadName: 'Lead respondido por usuário',
        source: 'WhatsApp',
        leadCreatedAt: '2026-08-08T13:00:00.000Z',
        lastMessageAt: '2026-08-08T13:05:00.000Z',
        lastMessage: 'Olá, como posso ajudar?',
        lastMessageDirection: MessageDirection.OUTBOUND,
        lastMessageType: MessageType.TEXT,
        lastInboundAt: '2026-08-08T13:00:00.000Z',
        hasOutbound: true,
        runtimeMode: LeadRuntimeMode.HUMAN
      },
      {
        leadId: 'old-open-window',
        leadName: 'Janela aberta',
        leadState: LeadState.ARCHIVED,
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
      'recent-human-answered',
      'old-open-window',
      'recent-answered',
      'established-open-window',
      'old-expired-window',
      'old-automation-only',
      'returning-unanswered'
    ])
    expect(result.counts).toEqual({
      all: 9,
      new: 2,
      today: 4,
      noResponse24h: 2
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
    expect(
      result.items.find((item) => item.leadId === 'recent-answered')
        ?.lastMessageStatus
    ).toBe(MessageStatus.READ)
    expect(
      result.items.find((item) => item.leadId === 'recent-answered')?.leadState
    ).toBe(LeadState.ARCHIVED)
    expect(
      result.items.find((item) => item.leadId === 'recent-unanswered')?.leadName
    ).toBe('Lead sem nome')
    expect(result.items.map((item) => [item.leadId, item.status])).toEqual([
      ['recent-automation-replied', 'new'],
      ['recent-unanswered', 'new'],
      ['recent-human-answered', 'today'],
      ['old-open-window', 'today'],
      ['recent-answered', null],
      ['established-open-window', 'today'],
      ['old-expired-window', 'noResponse24h'],
      ['old-automation-only', 'noResponse24h'],
      ['returning-unanswered', 'today']
    ])
  })

  it.each([
    [
      DashboardConversationFilter.NEW,
      ['recent-automation-replied', 'recent-unanswered']
    ],
    [
      DashboardConversationFilter.TODAY,
      [
        'recent-human-answered',
        'old-open-window',
        'established-open-window',
        'returning-unanswered'
      ]
    ],
    [
      DashboardConversationFilter.NO_RESPONSE_24H,
      ['old-expired-window', 'old-automation-only']
    ]
  ])('filters conversations by %s', async (filter, expectedLeadIds) => {
    const result = await service.getConversations('user-1', filter)

    expect(result.items.map((item) => item.leadId)).toEqual(expectedLeadIds)
  })
})

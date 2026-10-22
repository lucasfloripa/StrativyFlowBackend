import { In, Repository } from 'typeorm'

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
      find: jest
        .fn()
        .mockResolvedValue([{ id: 'mapping-1', companyId: 'company-1' }])
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
        leadCreatedAt: '2026-08-04T11:00:00.000Z',
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
      'old-automation-only',
      'old-expired-window',
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
      ['old-automation-only', 'noResponse24h'],
      ['old-expired-window', 'noResponse24h'],
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
        'returning-unanswered',
        'old-open-window',
        'established-open-window'
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

  it('filters conversation SQL by Company instead of legacy user information ownership', async () => {
    await service.getConversations('user-1', DashboardConversationFilter.ALL)

    expect(userInformationsRepo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: ['companyId']
    })
    expect(leadRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE lead."companyId"::text = ANY($1::text[])'),
      [
        ['company-1'],
        MessageDirection.INBOUND,
        MessageDirection.OUTBOUND,
        LeadRuntimeMode.AUTOMATION,
        MessageDirection.AUTOMATIC
      ]
    )
    const sql: unknown = leadRepo.query.mock.calls[0][0]
    expect(sql).not.toContain('lead."userInformationsId"')
  })

  it('shares conversations between users linked to the same Company', async () => {
    const firstUser = await service.getConversations(
      'user-1',
      DashboardConversationFilter.ALL
    )
    userInformationsRepo.find.mockResolvedValue([
      Object.assign(new UserInformations(), {
        id: 'mapping-2',
        companyId: 'company-1'
      })
    ])
    const secondUser = await service.getConversations(
      'user-2',
      DashboardConversationFilter.ALL
    )

    expect(secondUser.items).toEqual(firstUser.items)
    expect(secondUser.counts).toEqual(firstUser.counts)
    expect(userInformationsRepo.find).toHaveBeenLastCalledWith({
      where: { userId: 'user-2' },
      select: ['companyId']
    })
    expect(leadRepo.query.mock.calls[1][1]).toEqual(
      leadRepo.query.mock.calls[0][1]
    )
  })

  it('uses only linked Companies and ignores null and duplicate mappings', async () => {
    userInformationsRepo.find.mockResolvedValue([
      Object.assign(new UserInformations(), { companyId: null }),
      Object.assign(new UserInformations(), { companyId: 'company-1' }),
      Object.assign(new UserInformations(), { companyId: 'company-1' }),
      Object.assign(new UserInformations(), { companyId: 'company-2' })
    ])

    await service.getConversations('user-1', DashboardConversationFilter.ALL)

    expect(leadRepo.query).toHaveBeenCalledWith(expect.any(String), [
      ['company-1', 'company-2'],
      MessageDirection.INBOUND,
      MessageDirection.OUTBOUND,
      LeadRuntimeMode.AUTOMATION,
      MessageDirection.AUTOMATIC
    ])
  })

  it('returns no conversations without querying leads when no Company is linked', async () => {
    userInformationsRepo.find.mockResolvedValue([
      Object.assign(new UserInformations(), {
        id: 'legacy-mapping',
        companyId: null
      })
    ])

    await expect(
      service.getConversations('user-1', DashboardConversationFilter.TODAY)
    ).resolves.toEqual({
      filter: DashboardConversationFilter.TODAY,
      items: [],
      counts: { all: 0, new: 0, today: 0, noResponse24h: 0 }
    })
    expect(leadRepo.query).not.toHaveBeenCalled()
  })
})

describe('DashboardService Company summary', () => {
  const createService = () => {
    const leadQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2)
    }
    const followUpQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest
        .fn()
        .mockResolvedValue({ overdue: '1', today: '2', scheduled: '3' })
    }
    const leadRepository = {
      count: jest.fn().mockResolvedValue(5),
      createQueryBuilder: jest.fn().mockReturnValue(leadQueryBuilder)
    }
    const followUpRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(followUpQueryBuilder)
    }
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'mapping-1', companyId: 'company-1' },
        { id: 'mapping-2', companyId: 'company-1' },
        { id: 'mapping-3', companyId: null }
      ])
    }
    const service = new DashboardService(
      leadRepository as unknown as Repository<Lead>,
      followUpRepository as unknown as Repository<FollowUp>,
      userInformationsRepository as unknown as Repository<UserInformations>
    )

    return {
      service,
      leadRepository,
      followUpRepository,
      userInformationsRepository,
      leadQueryBuilder,
      followUpQueryBuilder
    }
  }

  it('scopes every Home counter to the user Companies without duplicating memberships', async () => {
    const dependencies = createService()

    await expect(dependencies.service.getSummary('user-1')).resolves.toEqual({
      activeLeads: 5,
      newToday: 2,
      withoutConversation24h: 2,
      followUps: { overdue: 1, today: 2, scheduled: 3 }
    })
    expect(dependencies.leadRepository.count).toHaveBeenCalledWith({
      where: { companyId: In(['company-1']), state: LeadState.ACTIVE }
    })
    expect(dependencies.leadQueryBuilder.where).toHaveBeenCalledTimes(2)
    expect(dependencies.leadQueryBuilder.where).toHaveBeenNthCalledWith(
      1,
      'lead."companyId" IN (:...companyIds)',
      { companyIds: ['company-1'] }
    )
    expect(dependencies.leadQueryBuilder.where).toHaveBeenNthCalledWith(
      2,
      'lead."companyId" IN (:...companyIds)',
      { companyIds: ['company-1'] }
    )
    expect(dependencies.followUpQueryBuilder.where).toHaveBeenCalledWith(
      'lead."companyId" IN (:...companyIds)',
      { companyIds: ['company-1'] }
    )
  })

  it('returns zero counters without Company membership and does not query tenant data', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([])

    await expect(dependencies.service.getSummary('user-1')).resolves.toEqual({
      activeLeads: 0,
      newToday: 0,
      withoutConversation24h: 0,
      followUps: { overdue: 0, today: 0, scheduled: 0 }
    })
    expect(dependencies.leadRepository.count).not.toHaveBeenCalled()
    expect(
      dependencies.leadRepository.createQueryBuilder
    ).not.toHaveBeenCalled()
    expect(
      dependencies.followUpRepository.createQueryBuilder
    ).not.toHaveBeenCalled()
  })
})

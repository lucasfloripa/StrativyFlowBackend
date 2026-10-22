import { Company } from '../modules/company/company.entity'
import {
  Lead,
  LeadFlowState,
  LeadRuntimeMode,
  LeadState
} from '../modules/leads/entities/lead.entity'
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageSource,
  MessageType
} from '../modules/leads/entities/message.entity'
import { UserInformations } from '../modules/user/entities/user-informations.entity'

export const FIXED_DATE = new Date('2026-01-15T12:00:00.000Z')

/**
 * Stable UUIDs for fixtures. Guards validate ids as UUIDs, so tests that
 * cross the HTTP layer need real UUID strings.
 */
export const FIXTURE_IDS = {
  company: '00000000-0000-4000-8000-000000000001',
  otherCompany: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000011',
  otherUser: '00000000-0000-4000-8000-000000000012',
  userInformations: '00000000-0000-4000-8000-000000000021',
  lead: '00000000-0000-4000-8000-000000000031',
  message: '00000000-0000-4000-8000-000000000041'
} as const

export function buildCompany(overrides: Partial<Company> = {}): Company {
  return Object.assign(new Company(), {
    id: FIXTURE_IDS.company,
    name: 'Empresa Teste',
    companyPhoneNumber: null,
    companyPhoneNumberId: null,
    whatsappToken: null,
    messengerPageId: null,
    messengerToken: null,
    instagramAccountId: null,
    instagramToken: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides
  })
}

export function buildUserInformations(
  overrides: Partial<UserInformations> = {}
): UserInformations {
  return Object.assign(new UserInformations(), {
    id: FIXTURE_IDS.userInformations,
    userId: FIXTURE_IDS.user,
    companyId: FIXTURE_IDS.company,
    name: 'Usuário Teste',
    email: 'usuario@teste.com',
    phoneNumber: '5548999990001',
    notificationWhatsAppNumbers: [],
    notificationEmails: [],
    notificationPreferences: {},
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides
  })
}

export function buildLead(overrides: Partial<Lead> = {}): Lead {
  return Object.assign(new Lead(), {
    id: FIXTURE_IDS.lead,
    companyId: FIXTURE_IDS.company,
    name: 'Lead Teste',
    phone: '5548999990000',
    state: LeadState.ACTIVE,
    flowState: LeadFlowState.IN_CONVERSATION,
    runtimeMode: LeadRuntimeMode.AUTOMATION,
    isFavorite: false,
    lastActivityAt: FIXED_DATE,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides
  })
}

export function buildMessage(overrides: Partial<Message> = {}): Message {
  return Object.assign(new Message(), {
    id: FIXTURE_IDS.message,
    leadId: FIXTURE_IDS.lead,
    direction: MessageDirection.INBOUND,
    channel: MessageChannel.WHATSAPP,
    type: MessageType.TEXT,
    source: MessageSource.NORMAL,
    content: 'Olá',
    externalMessageId: null,
    status: null,
    metadata: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides
  })
}

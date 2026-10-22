import { Lead, LeadState } from '../modules/leads/entities/lead.entity'
import { MessageDirection } from '../modules/leads/entities/message.entity'

import {
  buildCompany,
  buildLead,
  buildMessage,
  buildUserInformations,
  createMockRepository,
  FIXED_DATE,
  FIXTURE_IDS
} from './index'

describe('testing helpers', () => {
  describe('createMockRepository', () => {
    it('exposes common repository methods as jest mocks', async () => {
      const repository = createMockRepository<Lead>()
      repository.findOne.mockResolvedValue(buildLead())

      await expect(
        repository.findOne({ where: { id: FIXTURE_IDS.lead } })
      ).resolves.toMatchObject({ id: FIXTURE_IDS.lead })
      expect(repository.findOne).toHaveBeenCalledTimes(1)
    })

    it('returns the given input from create', () => {
      const repository = createMockRepository<Lead>()
      const draft = { name: 'Novo Lead' }

      expect(repository.create(draft)).toBe(draft)
    })
  })

  describe('factories', () => {
    it('builds entities that belong to the default fixture company', () => {
      const company = buildCompany()
      const lead = buildLead()
      const userInformations = buildUserInformations()

      expect(lead).toBeInstanceOf(Lead)
      expect(lead.companyId).toBe(company.id)
      expect(userInformations.companyId).toBe(company.id)
      expect(lead.createdAt).toEqual(FIXED_DATE)
    })

    it('applies overrides on top of the defaults', () => {
      const lead = buildLead({
        companyId: FIXTURE_IDS.otherCompany,
        state: LeadState.ARCHIVED
      })
      const message = buildMessage({ direction: MessageDirection.OUTBOUND })

      expect(lead.companyId).toBe(FIXTURE_IDS.otherCompany)
      expect(lead.state).toBe(LeadState.ARCHIVED)
      expect(message.direction).toBe(MessageDirection.OUTBOUND)
      expect(message.leadId).toBe(FIXTURE_IDS.lead)
    })
  })
})

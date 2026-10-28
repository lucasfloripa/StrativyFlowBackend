import {
  Lead,
  LeadFlowState,
  LeadRuntimeMode
} from '../leads/entities/lead.entity'

import { LEAD_WRITABLE_COLUMNS, LeadWriter } from './lead-writer'

import type { Repository } from 'typeorm'

const buildLead = (overrides: Partial<Lead> = {}): Lead =>
  Object.assign(new Lead(), {
    id: 'lead-1',
    companyId: 'company-1',
    name: 'Lucas',
    flowState: LeadFlowState.ASKING_LOCATION,
    runtimeMode: LeadRuntimeMode.AUTOMATION,
    lastActivityAt: new Date('2026-10-28T10:00:00.000Z'),
    socialLinks: { instagram: '@lucas' },
    ...overrides
  })

describe('LeadWriter', () => {
  const createWriter = (stored: Lead | null = buildLead()) => {
    const leadRepo = {
      findOne: jest.fn().mockResolvedValue(stored),
      findOneOrFail: jest.fn().mockResolvedValue(stored),
      save: jest.fn((lead: Lead) => Promise.resolve(lead)),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const writer = new LeadWriter(leadRepo as unknown as Repository<Lead>)

    return { writer, leadRepo }
  }

  describe('save', () => {
    // Regression P7: the full save overwrote columns changed meanwhile.
    it('updates only the columns changed since the lead was read', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = await writer.findOneOrFail({ where: { id: 'lead-1' } })

      lead.flowState = LeadFlowState.ASKING_CONTEXT
      lead.lastInboundMessageId = 'wamid.2'
      await writer.save(lead)

      expect(leadRepo.update).toHaveBeenCalledWith(
        { id: 'lead-1' },
        {
          flowState: LeadFlowState.ASKING_CONTEXT,
          lastInboundMessageId: 'wamid.2'
        }
      )
      expect(leadRepo.save).not.toHaveBeenCalled()
    })

    it('leaves a runtimeMode changed elsewhere untouched', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = await writer.findOneOrFail({ where: { id: 'lead-1' } })

      // Meanwhile an agent switches the lead to HUMAN; this copy is stale.
      lead.lastActivityAt = new Date('2026-10-28T10:05:00.000Z')
      await writer.save(lead)

      const [, changes] = leadRepo.update.mock.calls[0] as [unknown, object]
      expect(changes).toEqual({
        lastActivityAt: new Date('2026-10-28T10:05:00.000Z')
      })
      expect(changes).not.toHaveProperty('runtimeMode')
    })

    it('compares dates and JSON columns by value', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = await writer.findOneOrFail({ where: { id: 'lead-1' } })

      lead.lastActivityAt = new Date('2026-10-28T10:00:00.000Z')
      lead.socialLinks = { instagram: '@lucas' }
      await writer.save(lead)

      expect(leadRepo.update).not.toHaveBeenCalled()
    })

    it('writes nothing when nothing changed, and only new changes on a second save', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = await writer.findOneOrFail({ where: { id: 'lead-1' } })

      await writer.save(lead)
      lead.name = 'Lucas G.'
      await writer.save(lead)
      await writer.save(lead)

      expect(leadRepo.update).toHaveBeenCalledTimes(1)
      expect(leadRepo.update).toHaveBeenCalledWith(
        { id: 'lead-1' },
        { name: 'Lucas G.' }
      )
    })

    it('tracks leads that come from elsewhere (identity resolution)', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = writer.track(buildLead())

      lead.name = 'Ana'
      await writer.save(lead)

      expect(leadRepo.update).toHaveBeenCalledWith(
        { id: 'lead-1' },
        { name: 'Ana' }
      )
    })

    it('falls back to a full save for an untracked lead', async () => {
      const { writer, leadRepo } = createWriter()
      const lead = buildLead()

      await writer.save(lead)

      expect(leadRepo.save).toHaveBeenCalledWith(lead)
      expect(leadRepo.update).not.toHaveBeenCalled()
    })

    it('never writes relations or timestamps', () => {
      expect(LEAD_WRITABLE_COLUMNS).not.toContain('company')
      expect(LEAD_WRITABLE_COLUMNS).not.toContain('channelIdentities')
      expect(LEAD_WRITABLE_COLUMNS).not.toContain('updatedAt')
    })
  })

  describe('findOne', () => {
    it('returns null without tracking anything', async () => {
      const { writer } = createWriter(null)

      await expect(
        writer.findOne({ where: { id: 'lead-404' } })
      ).resolves.toBeNull()
    })
  })
})

import { DataSource, EntityManager } from 'typeorm'

import {
  LeadChannel,
  LeadChannelIdentity
} from '../entities/lead-channel-identity.entity'
import { Lead } from '../entities/lead.entity'

import { LeadChannelIdentityService } from './lead-channel-identity.service'

describe('LeadChannelIdentityService', () => {
  it('creates a lead identity without coupling it to UserInformations', async () => {
    let createdIdentity: Partial<LeadChannelIdentity> | undefined
    const savedLead = {
      id: 'lead-1',
      userInformationsId: 'flow-owner-1'
    } as Lead
    const identityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((identity: Partial<LeadChannelIdentity>) => {
        createdIdentity = identity
        return identity
      }),
      save: jest.fn((identity: Partial<LeadChannelIdentity>) =>
        Promise.resolve({
          id: 'identity-1',
          ...identity
        })
      )
    }
    const leadRepo = {
      findOne: jest.fn(),
      create: jest.fn((lead: Partial<Lead>) => lead),
      save: jest.fn().mockResolvedValue(savedLead)
    }
    const manager = {
      getRepository: jest.fn(
        (entity: typeof Lead | typeof LeadChannelIdentity) =>
          entity === Lead ? leadRepo : identityRepo
      )
    }
    const dataSource = {
      transaction: jest.fn((operation: (manager: EntityManager) => unknown) =>
        operation(manager as unknown as EntityManager)
      )
    }
    const service = new LeadChannelIdentityService(
      dataSource as unknown as DataSource
    )

    const result = await service.findOrCreateLeadForIdentity({
      channel: LeadChannel.WHATSAPP,
      externalAccountId: ' phone-number-id ',
      externalUserId: ' wa-id ',
      profileName: 'João',
      lastInteractionAt: new Date('2026-08-11T12:00:00.000Z'),
      leadDraft: {
        userInformationsId: 'flow-owner-1',
        phone: 'wa-id'
      }
    })

    expect(result.leadCreated).toBe(true)
    expect(identityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        channel: LeadChannel.WHATSAPP,
        externalAccountId: 'phone-number-id',
        externalUserId: 'wa-id'
      })
    )
    expect(createdIdentity).not.toHaveProperty('userInformationsId')
  })

  it('reuses a legacy lead when attaching a verified identity', async () => {
    const legacyLead = { id: 'lead-existing' } as Lead
    const identityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((identity: Partial<LeadChannelIdentity>) => identity),
      save: jest.fn((identity: Partial<LeadChannelIdentity>) =>
        Promise.resolve({
          id: 'identity-1',
          ...identity
        })
      )
    }
    const leadRepo = {
      findOne: jest.fn().mockResolvedValue(legacyLead),
      create: jest.fn(),
      save: jest.fn()
    }
    const manager = {
      getRepository: jest.fn(
        (entity: typeof Lead | typeof LeadChannelIdentity) =>
          entity === Lead ? leadRepo : identityRepo
      )
    }
    const dataSource = {
      transaction: jest.fn((operation: (manager: EntityManager) => unknown) =>
        operation(manager as unknown as EntityManager)
      )
    }
    const service = new LeadChannelIdentityService(
      dataSource as unknown as DataSource
    )

    const result = await service.findOrCreateLeadForIdentity({
      channel: LeadChannel.WHATSAPP,
      externalAccountId: 'phone-number-id',
      externalUserId: 'wa-id',
      legacyLeadId: legacyLead.id,
      leadDraft: { phone: 'wa-id' }
    })

    expect(result.lead).toBe(legacyLead)
    expect(result.leadCreated).toBe(false)
    expect(leadRepo.save).not.toHaveBeenCalled()
  })
})

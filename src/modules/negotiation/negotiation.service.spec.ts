import { Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'

import {
  Negotiation,
  NegotiationStage,
  NegotiationStatus
} from './entities/negotiation.entity'
import { NegotiationService } from './negotiation.service'

describe('NegotiationService', () => {
  it('loads only negotiations from the requested lead', async () => {
    const negotiationRepository = {
      find: jest.fn().mockResolvedValue([])
    } as unknown as Repository<Negotiation>
    const service = new NegotiationService(
      negotiationRepository,
      {} as Repository<FollowUp>
    )

    await service.findAll('lead-1')

    expect(negotiationRepository.find).toHaveBeenCalledWith({
      where: { leadId: 'lead-1' },
      relations: {
        financial: {
          costs: true,
          payments: true
        }
      },
      order: { createdAt: 'DESC' }
    })
  })

  it.each([
    {
      requestedStage: NegotiationStage.WON,
      expectedStatus: NegotiationStatus.WON
    },
    {
      requestedStage: NegotiationStage.LOST,
      expectedStatus: NegotiationStatus.LOST
    }
  ])(
    'closes a negotiation with matching $expectedStatus stage and status',
    async ({ requestedStage, expectedStatus }) => {
      const negotiation = {
        id: 'negotiation-1',
        stage: NegotiationStage.CONTACTED,
        status: NegotiationStatus.OPEN,
        closedAt: null
      } as Negotiation
      const negotiationRepository = {
        findOne: jest.fn().mockResolvedValue(negotiation),
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity))
      } as unknown as Repository<Negotiation>
      const followUpRepository = {
        update: jest.fn().mockResolvedValue({ affected: 0 })
      } as unknown as Repository<FollowUp>
      const service = new NegotiationService(
        negotiationRepository,
        followUpRepository
      )

      const result = await service.update('negotiation-1', {
        stage: requestedStage
      })

      expect(result.stage).toBe(requestedStage)
      expect(result.status).toBe(expectedStatus)
      expect(result.closedAt).toBeInstanceOf(Date)
      expect(followUpRepository.update).toHaveBeenCalled()
    }
  )

  it('reopens a negotiation with NEW stage and OPEN status', async () => {
    const negotiation = {
      id: 'negotiation-1',
      stage: NegotiationStage.WON,
      status: NegotiationStatus.WON,
      closedAt: new Date('2026-08-28T12:00:00.000Z')
    } as Negotiation
    const negotiationRepository = {
      findOne: jest.fn().mockResolvedValue(negotiation),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity))
    } as unknown as Repository<Negotiation>
    const service = new NegotiationService(
      negotiationRepository,
      {} as Repository<FollowUp>
    )

    const result = await service.update('negotiation-1', {
      status: NegotiationStatus.OPEN
    })

    expect(result.stage).toBe(NegotiationStage.NEW)
    expect(result.status).toBe(NegotiationStatus.OPEN)
    expect(result.closedAt).toBeNull()
  })
})

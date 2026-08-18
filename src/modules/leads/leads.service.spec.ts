import { ConflictException } from '@nestjs/common'
import { Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import { RabbitPublisherService } from '../rabbit/services/rabbit-publisher.service'
import { StorageService } from '../storage/storage.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { Lead } from './entities/lead.entity'
import { Message } from './entities/message.entity'
import { LeadsService } from './leads.service'

describe('LeadsService create', () => {
  it('blocks a duplicate phone with an equivalent ninth digit variant', async () => {
    const transactionalLeadRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'existing-lead',
        phone: '554884296447'
      })
    }
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(transactionalLeadRepository)
    }
    const leadRepository = {
      manager: {
        transaction: jest.fn(
          async (operation: (transactionManager: typeof manager) => unknown) =>
            await operation(manager)
        )
      }
    } as unknown as Repository<Lead>
    const userInformationsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'information-1' })
    } as unknown as Repository<UserInformations>
    const rabbitPublisherService = {
      publish: jest.fn()
    } as unknown as RabbitPublisherService
    const service = new LeadsService(
      leadRepository,
      {} as Repository<Message>,
      {} as Repository<FollowUp>,
      userInformationsRepository,
      rabbitPublisherService,
      {} as StorageService
    )

    await expect(
      service.create('user-1', {
        name: 'Lead duplicado',
        phone: '5548984296447'
      })
    ).rejects.toThrow(ConflictException)

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['information-1:554884296447']
    )
    expect(transactionalLeadRepository.findOne).toHaveBeenCalledWith({
      where: [
        {
          userInformationsId: 'information-1',
          phone: '5548984296447'
        },
        {
          userInformationsId: 'information-1',
          phone: '554884296447'
        }
      ]
    })
    expect(rabbitPublisherService.publish).not.toHaveBeenCalled()
  })
})

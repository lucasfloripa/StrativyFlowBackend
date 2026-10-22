import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Repository } from 'typeorm'

import { Company } from '../../company/company.entity'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { LeadChannel } from '../entities/lead-channel-identity.entity'
import { Lead } from '../entities/lead.entity'
import { LeadsService } from '../leads.service'

import { LeadChannelIdentityService } from './lead-channel-identity.service'
import { LeadMessageContextService } from './lead-message-context.service'

describe('LeadMessageContextService WhatsApp', () => {
  const createService = () => {
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1',
      phone: '5548999999999'
    })
    const company = Object.assign(new Company(), {
      id: 'company-1',
      companyPhoneNumberId: ' company-phone-id ',
      whatsappToken: ' company-token '
    })
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const userInformationsRepo = { findOne: jest.fn() }
    const leadsService = {
      findOwnedLeadOrFail: jest.fn().mockResolvedValue(lead)
    }
    const identityService = {
      findLatestIdentityForLead: jest.fn().mockResolvedValue({
        externalAccountId: 'company-phone-id',
        externalUserId: '5548888888888'
      })
    }
    const service = new LeadMessageContextService(
      userInformationsRepo as unknown as Repository<UserInformations>,
      leadsService as unknown as LeadsService,
      identityService as unknown as LeadChannelIdentityService,
      companyRepo as unknown as Repository<Company>
    )

    return {
      service,
      lead,
      company,
      companyRepo,
      userInformationsRepo,
      leadsService,
      identityService
    }
  }

  it('loads and trims credentials from Company for a lead without userInformationsId', async () => {
    const dependencies = createService()

    await expect(
      dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
    ).resolves.toEqual({
      lead: dependencies.lead,
      destinationPhone: '5548888888888',
      phoneNumberId: 'company-phone-id',
      whatsappToken: 'company-token'
    })
    expect(dependencies.leadsService.findOwnedLeadOrFail).toHaveBeenCalledWith(
      'user-1',
      'lead-1'
    )
    expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'company-1' }
    })
    expect(
      dependencies.identityService.findLatestIdentityForLead
    ).toHaveBeenCalledWith('lead-1', LeadChannel.WHATSAPP)
    expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
  })

  it('uses Company credentials even when a legacy user information binding exists', async () => {
    const dependencies = createService()
    dependencies.lead.userInformationsId = 'legacy-mapping'

    const context = await dependencies.service.resolveOutboundContextOrFail(
      'user-1',
      'lead-1'
    )

    expect(context.whatsappToken).toBe('company-token')
    expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
  })

  it('lets another authorized Company member use the same business connection', async () => {
    const dependencies = createService()

    const first = await dependencies.service.resolveOutboundContextOrFail(
      'user-1',
      'lead-1'
    )
    const second = await dependencies.service.resolveOutboundContextOrFail(
      'user-2',
      'lead-1'
    )

    expect(second).toEqual(first)
    expect(
      dependencies.leadsService.findOwnedLeadOrFail
    ).toHaveBeenLastCalledWith('user-2', 'lead-1')
  })

  it('falls back to the lead destination phone, not to user information credentials', async () => {
    const dependencies = createService()
    dependencies.identityService.findLatestIdentityForLead.mockResolvedValue(
      null
    )

    const context = await dependencies.service.resolveOutboundContextOrFail(
      'user-1',
      'lead-1'
    )

    expect(context.destinationPhone).toBe('5548999999999')
    expect(context.phoneNumberId).toBe('company-phone-id')
    expect(context.whatsappToken).toBe('company-token')
  })

  it.each([null, undefined, '', '   '])(
    'rejects missing Company token %s',
    async (token) => {
      const dependencies = createService()
      dependencies.company.whatsappToken = token

      await expect(
        dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
      ).rejects.toThrow('WhatsApp token is not configured for this company')
    }
  )

  it('rejects a missing Company phone number ID even if the identity has an ID', async () => {
    const dependencies = createService()
    dependencies.company.companyPhoneNumberId = null

    await expect(
      dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
    ).rejects.toThrow(
      'WhatsApp phoneNumberId is not configured for this company'
    )
  })

  it('rejects an identity for a different account instead of sending the token to that account', async () => {
    const dependencies = createService()
    dependencies.identityService.findLatestIdentityForLead.mockResolvedValue({
      externalAccountId: 'different-phone-id',
      externalUserId: '5548888888888'
    })

    await expect(
      dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
    ).rejects.toThrow('WhatsApp identity does not match the company account')
  })

  it('rejects a lead without Company', async () => {
    const dependencies = createService()
    dependencies.lead.companyId = null

    await expect(
      dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
  })

  it('rejects a Company that no longer exists', async () => {
    const dependencies = createService()
    dependencies.companyRepo.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.resolveOutboundContextOrFail('user-1', 'lead-1')
    ).rejects.toThrow('Company not found for this lead')
  })

  it('does not load credentials when lead authorization fails', async () => {
    const dependencies = createService()
    dependencies.leadsService.findOwnedLeadOrFail.mockRejectedValue(
      new ForbiddenException()
    )

    await expect(
      dependencies.service.resolveOutboundContextOrFail('intruder', 'lead-1')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
    expect(
      dependencies.identityService.findLatestIdentityForLead
    ).not.toHaveBeenCalled()
  })
})

describe('LeadMessageContextService Messenger', () => {
  const setup = () => {
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1'
    })
    const company = Object.assign(new Company(), {
      id: 'company-1',
      messengerPageId: ' page-1 ',
      messengerToken: ' company-page-token '
    })
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const userInformationsRepo = { findOne: jest.fn() }
    const leadsService = {
      findOwnedLeadOrFail: jest.fn().mockResolvedValue(lead)
    }
    const identities = {
      findLatestIdentityForLead: jest.fn().mockResolvedValue({
        externalAccountId: 'page-1',
        externalUserId: 'psid-1'
      })
    }
    const service = new LeadMessageContextService(
      userInformationsRepo as unknown as Repository<UserInformations>,
      leadsService as unknown as LeadsService,
      identities as unknown as LeadChannelIdentityService,
      companyRepo as unknown as Repository<Company>
    )
    return {
      service,
      lead,
      company,
      companyRepo,
      userInformationsRepo,
      leadsService,
      identities
    }
  }

  it.each(['user-1', 'user-2'])(
    'resolves the same Company page and token for authorized %s',
    async (userId) => {
      const dependencies = setup()
      await expect(
        dependencies.service.resolveMessengerOutboundContextOrFail(
          userId,
          'lead-1'
        )
      ).resolves.toEqual({
        lead: dependencies.lead,
        destinationPsid: 'psid-1',
        pageId: 'page-1',
        messengerToken: 'company-page-token'
      })
      expect(
        dependencies.leadsService.findOwnedLeadOrFail
      ).toHaveBeenCalledWith(userId, 'lead-1')
      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'company-1' }
      })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
    }
  )

  it.each([null, undefined, '', '  '])(
    'rejects Company token %s',
    async (token) => {
      const dependencies = setup()
      dependencies.company.messengerToken = token
      await expect(
        dependencies.service.resolveMessengerOutboundContextOrFail(
          'user-1',
          'lead-1'
        )
      ).rejects.toBeInstanceOf(BadRequestException)
    }
  )

  it('rejects an identity associated with a different Company page', async () => {
    const dependencies = setup()
    dependencies.company.messengerPageId = 'another-page'
    await expect(
      dependencies.service.resolveMessengerOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects missing Company, page configuration and identity', async () => {
    const dependencies = setup()
    dependencies.companyRepo.findOne.mockResolvedValue(null)
    await expect(
      dependencies.service.resolveMessengerOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    dependencies.lead.companyId = null
    await expect(
      dependencies.service.resolveMessengerOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    dependencies.identities.findLatestIdentityForLead.mockResolvedValue(null)
    await expect(
      dependencies.service.resolveMessengerOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('does not load credentials when Company access is denied', async () => {
    const dependencies = setup()
    dependencies.leadsService.findOwnedLeadOrFail.mockRejectedValue(
      new ForbiddenException()
    )
    await expect(
      dependencies.service.resolveMessengerOutboundContextOrFail(
        'foreign-user',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
  })
})

describe('LeadMessageContextService Instagram', () => {
  const setup = () => {
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1'
    })
    const company = Object.assign(new Company(), {
      id: 'company-1',
      instagramAccountId: 'instagram-account-1',
      instagramToken: 'company-instagram-token'
    })
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const userInformationsRepo = { findOne: jest.fn() }
    const leadsService = {
      findOwnedLeadOrFail: jest.fn().mockResolvedValue(lead)
    }
    const identities = {
      findLatestIdentityForLead: jest.fn().mockResolvedValue({
        externalAccountId: 'instagram-account-1',
        externalUserId: 'instagram-user-1'
      })
    }
    const service = new LeadMessageContextService(
      userInformationsRepo as unknown as Repository<UserInformations>,
      leadsService as unknown as LeadsService,
      identities as unknown as LeadChannelIdentityService,
      companyRepo as unknown as Repository<Company>
    )
    return {
      service,
      lead,
      company,
      companyRepo,
      userInformationsRepo,
      leadsService,
      identities
    }
  }

  it.each(['user-1', 'user-2'])(
    'resolves the shared Instagram account for authorized %s',
    async (userId) => {
      const dependencies = setup()
      await expect(
        dependencies.service.resolveInstagramOutboundContextOrFail(
          userId,
          'lead-1'
        )
      ).resolves.toEqual({
        lead: dependencies.lead,
        instagramAccountId: 'instagram-account-1',
        instagramUserId: 'instagram-user-1'
      })
      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'company-1' }
      })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
    }
  )

  it('rejects a channel identity linked to another Company account', async () => {
    const dependencies = setup()
    dependencies.company.instagramAccountId = 'another-account'
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toThrow('Instagram Account is not configured for this company')
  })

  it('rejects missing Company, Instagram token, or identity', async () => {
    const dependencies = setup()
    dependencies.lead.companyId = null
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toThrow('Company is not configured for this lead')

    dependencies.lead.companyId = 'company-1'
    dependencies.company.instagramToken = '  '
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toThrow('Instagram token is not configured for this company')

    dependencies.identities.findLatestIdentityForLead.mockResolvedValue(null)
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toThrow('Instagram identity is not configured for this lead')
  })

  it('does not resolve credentials before lead authorization', async () => {
    const dependencies = setup()
    dependencies.leadsService.findOwnedLeadOrFail.mockRejectedValue(
      new ForbiddenException()
    )
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'foreign-user',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
    expect(
      dependencies.identities.findLatestIdentityForLead
    ).not.toHaveBeenCalled()
  })
})

describe('LeadMessageContextService Instagram', () => {
  const setup = () => {
    const lead = Object.assign(new Lead(), {
      id: 'lead-1',
      companyId: 'company-1'
    })
    const company = Object.assign(new Company(), {
      id: 'company-1',
      instagramAccountId: 'instagram-account-1',
      instagramToken: 'company-instagram-token'
    })
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) }
    const userInformationsRepo = { findOne: jest.fn() }
    const leadsService = {
      findOwnedLeadOrFail: jest.fn().mockResolvedValue(lead)
    }
    const identities = {
      findLatestIdentityForLead: jest.fn().mockResolvedValue({
        externalAccountId: 'instagram-account-1',
        externalUserId: 'instagram-user-1'
      })
    }
    const service = new LeadMessageContextService(
      userInformationsRepo as unknown as Repository<UserInformations>,
      leadsService as unknown as LeadsService,
      identities as unknown as LeadChannelIdentityService,
      companyRepo as unknown as Repository<Company>
    )
    return {
      service,
      lead,
      company,
      companyRepo,
      userInformationsRepo,
      leadsService,
      identities
    }
  }

  it.each(['user-1', 'user-2'])(
    'resolves the Company Instagram account for authorized %s',
    async (userId) => {
      const dependencies = setup()
      await expect(
        dependencies.service.resolveInstagramOutboundContextOrFail(
          userId,
          'lead-1'
        )
      ).resolves.toEqual({
        lead: dependencies.lead,
        instagramAccountId: 'instagram-account-1',
        instagramUserId: 'instagram-user-1'
      })
      expect(dependencies.companyRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'company-1' }
      })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
    }
  )

  it('rejects an Instagram identity configured for a different Company account', async () => {
    const dependencies = setup()
    dependencies.company.instagramAccountId = 'another-account'
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects missing Company, account credentials, or channel identity', async () => {
    const dependencies = setup()
    dependencies.companyRepo.findOne.mockResolvedValue(null)
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    dependencies.lead.companyId = null
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    dependencies.identities.findLatestIdentityForLead.mockResolvedValue(null)
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'user-1',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('does not load Company credentials when membership authorization fails', async () => {
    const dependencies = setup()
    dependencies.leadsService.findOwnedLeadOrFail.mockRejectedValue(
      new ForbiddenException()
    )
    await expect(
      dependencies.service.resolveInstagramOutboundContextOrFail(
        'foreign-user',
        'lead-1'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(dependencies.companyRepo.findOne).not.toHaveBeenCalled()
  })
})

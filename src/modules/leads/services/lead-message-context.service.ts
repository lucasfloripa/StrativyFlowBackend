import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Company } from '../../company/company.entity'
import { UserInformations } from '../../user/entities/user-informations.entity'
import { LeadChannel } from '../entities/lead-channel-identity.entity'
import { Lead } from '../entities/lead.entity'
import { LeadsService } from '../leads.service'

import { LeadChannelIdentityService } from './lead-channel-identity.service'

type LeadMessageOutboundContext = {
  lead: Lead
  destinationPhone: string
  phoneNumberId: string
  whatsappToken: string
}

type MessengerLeadMessageOutboundContext = {
  lead: Lead
  destinationPsid: string
  pageId: string
  messengerToken: string
}

type InstagramLeadMessageOutboundContext = {
  lead: Lead
  instagramAccountId: string
  instagramUserId: string
}

@Injectable()
export class LeadMessageContextService {
  constructor(
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    private readonly leadsService: LeadsService,
    private readonly leadChannelIdentityService: LeadChannelIdentityService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>
  ) {}

  async resolveOutboundContextOrFail(
    userId: string,
    leadId: string
  ): Promise<LeadMessageOutboundContext> {
    const lead = await this.leadsService.findOwnedLeadOrFail(userId, leadId)
    const whatsappIdentity =
      await this.leadChannelIdentityService.findLatestIdentityForLead(
        lead.id,
        LeadChannel.WHATSAPP
      )

    const destinationPhone =
      whatsappIdentity?.externalUserId.trim() || lead.phone?.trim()

    if (!destinationPhone) {
      throw new BadRequestException('Lead phone is missing')
    }

    if (!lead.companyId) {
      throw new BadRequestException('Company is not configured for this lead')
    }

    const company = await this.companyRepo.findOne({
      where: { id: lead.companyId }
    })

    if (!company) {
      throw new BadRequestException('Company not found for this lead')
    }

    const phoneNumberId = company.companyPhoneNumberId?.trim()
    const whatsappToken = company.whatsappToken?.trim()

    if (!phoneNumberId) {
      throw new BadRequestException(
        'WhatsApp phoneNumberId is not configured for this company'
      )
    }

    if (!whatsappToken) {
      throw new BadRequestException(
        'WhatsApp token is not configured for this company'
      )
    }

    if (
      whatsappIdentity &&
      whatsappIdentity.externalAccountId.trim() !== phoneNumberId
    ) {
      throw new BadRequestException(
        'WhatsApp identity does not match the company account'
      )
    }

    return {
      lead,
      destinationPhone,
      phoneNumberId,
      whatsappToken
    }
  }

  async resolveMessengerOutboundContextOrFail(
    userId: string,
    leadId: string
  ): Promise<MessengerLeadMessageOutboundContext> {
    const lead = await this.leadsService.findOwnedLeadOrFail(userId, leadId)
    const messengerIdentity =
      await this.leadChannelIdentityService.findLatestIdentityForLead(
        lead.id,
        LeadChannel.MESSENGER
      )

    const destinationPsid = messengerIdentity?.externalUserId.trim()
    const pageId = messengerIdentity?.externalAccountId.trim()

    if (!destinationPsid || !pageId) {
      throw new BadRequestException(
        'Messenger identity is not configured for this lead'
      )
    }

    if (!lead.companyId) {
      throw new BadRequestException('Company is not configured for this lead')
    }
    const company = await this.companyRepo.findOne({
      where: { id: lead.companyId }
    })
    const configuredPageId = company?.messengerPageId?.trim()
    const messengerToken = company?.messengerToken?.trim()

    if (configuredPageId !== pageId || !messengerToken) {
      throw new BadRequestException(
        'Messenger Page or token is not configured for this company'
      )
    }

    return {
      lead,
      destinationPsid,
      pageId,
      messengerToken
    }
  }

  async resolveInstagramOutboundContextOrFail(
    userId: string,
    leadId: string
  ): Promise<InstagramLeadMessageOutboundContext> {
    const lead = await this.leadsService.findOwnedLeadOrFail(userId, leadId)
    const instagramIdentity =
      await this.leadChannelIdentityService.findLatestIdentityForLead(
        lead.id,
        LeadChannel.INSTAGRAM
      )

    const instagramUserId = instagramIdentity?.externalUserId.trim()
    const instagramAccountId = instagramIdentity?.externalAccountId.trim()

    if (!instagramUserId || !instagramAccountId) {
      throw new BadRequestException(
        'Instagram identity is not configured for this lead'
      )
    }

    if (!lead.companyId) {
      throw new BadRequestException('Company is not configured for this lead')
    }

    const company = await this.companyRepo.findOne({
      where: { id: lead.companyId }
    })

    if (company?.instagramAccountId?.trim() !== instagramAccountId) {
      throw new BadRequestException(
        'Instagram Account is not configured for this company'
      )
    }

    if (!company.instagramToken?.trim()) {
      throw new BadRequestException(
        'Instagram token is not configured for this company'
      )
    }

    return {
      lead,
      instagramAccountId,
      instagramUserId
    }
  }

  async markLeadActivity(lead: Lead): Promise<void> {
    lead.lastActivityAt = new Date()
    await this.leadsService.saveLead(lead)
  }
}

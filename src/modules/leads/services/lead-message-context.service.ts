import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserInformations } from '../../user/entities/user-informations.entity'

import { Lead } from '../entities/lead.entity'
import { LeadsService } from '../leads.service'

type LeadMessageOutboundContext = {
  lead: Lead
  destinationPhone: string
  phoneNumberId: string
}

@Injectable()
export class LeadMessageContextService {
  constructor(
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>,
    private readonly leadsService: LeadsService
  ) {}

  async resolveOutboundContextOrFail(
    userId: string,
    leadId: string
  ): Promise<LeadMessageOutboundContext> {
    const lead = await this.leadsService.findOwnedLeadOrFail(userId, leadId)

    const destinationPhone = lead.phone?.trim()

    if (!destinationPhone) {
      throw new BadRequestException('Lead phone is missing')
    }

    const userInformations = lead.userInformationsId
      ? await this.userInformationsRepo.findOne({
          where: { id: lead.userInformationsId }
        })
      : null

    const phoneNumberId =
      userInformations?.phoneNumberId?.trim() ||
      process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!phoneNumberId?.trim()) {
      throw new BadRequestException(
        'WhatsApp phoneNumberId is not configured for this lead'
      )
    }

    return {
      lead,
      destinationPhone,
      phoneNumberId
    }
  }

  async markLeadActivity(lead: Lead): Promise<void> {
    lead.lastActivityAt = new Date()
    await this.leadsService.saveLead(lead)
  }
}

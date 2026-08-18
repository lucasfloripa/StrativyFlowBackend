import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource, DeepPartial, Repository } from 'typeorm'

import {
  LeadChannel,
  LeadChannelIdentity
} from '../entities/lead-channel-identity.entity'
import { Lead } from '../entities/lead.entity'

type LeadChannelIdentityKey = {
  channel: LeadChannel
  externalAccountId: string
  externalUserId: string
}

type FindOrCreateLeadForIdentityParams = LeadChannelIdentityKey & {
  profileName?: string | null
  profilePictureUrl?: string | null
  lastInteractionAt?: Date | null
  legacyLeadId?: string
  leadDraft: DeepPartial<Lead>
}

type ResolvedLeadChannelIdentity = {
  lead: Lead
  identity: LeadChannelIdentity
  leadCreated: boolean
}

@Injectable()
export class LeadChannelIdentityService {
  constructor(private readonly dataSource: DataSource) {}

  async findIdentity(
    identityKey: LeadChannelIdentityKey
  ): Promise<LeadChannelIdentity | null> {
    const key = this.normalizeIdentityKey(identityKey)

    return this.dataSource.getRepository(LeadChannelIdentity).findOne({
      where: key,
      relations: { lead: true }
    })
  }

  async findLatestIdentityForLead(
    leadId: string,
    channel: LeadChannel
  ): Promise<LeadChannelIdentity | null> {
    return this.dataSource.getRepository(LeadChannelIdentity).findOne({
      where: { leadId, channel },
      order: {
        lastInteractionAt: 'DESC',
        createdAt: 'DESC'
      }
    })
  }

  async findOrCreateLeadForIdentity(
    params: FindOrCreateLeadForIdentityParams
  ): Promise<ResolvedLeadChannelIdentity> {
    const key = this.normalizeIdentityKey(params)

    try {
      return await this.dataSource.transaction(async (manager) => {
        const identityRepo = manager.getRepository(LeadChannelIdentity)
        const leadRepo = manager.getRepository(Lead)
        const existingIdentity = await identityRepo.findOne({
          where: key,
          relations: { lead: true }
        })

        if (existingIdentity) {
          await this.updateIdentityInteraction(
            identityRepo,
            existingIdentity,
            params
          )

          return {
            lead: existingIdentity.lead,
            identity: existingIdentity,
            leadCreated: false
          }
        }

        const legacyLead = params.legacyLeadId
          ? await leadRepo.findOne({ where: { id: params.legacyLeadId } })
          : null
        const lead =
          legacyLead ?? (await leadRepo.save(leadRepo.create(params.leadDraft)))
        const identity = await identityRepo.save(
          identityRepo.create({
            ...key,
            leadId: lead.id,
            profileName: params.profileName?.trim() || null,
            profilePictureUrl: params.profilePictureUrl?.trim() || null,
            lastInteractionAt: params.lastInteractionAt ?? null
          })
        )

        identity.lead = lead

        return {
          lead,
          identity,
          leadCreated: legacyLead === null
        }
      })
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error
      }

      const identity = await this.findIdentity(key)
      if (!identity) {
        throw error
      }

      return {
        lead: identity.lead,
        identity,
        leadCreated: false
      }
    }
  }

  private async updateIdentityInteraction(
    identityRepo: Repository<LeadChannelIdentity>,
    identity: LeadChannelIdentity,
    params: FindOrCreateLeadForIdentityParams
  ): Promise<void> {
    const profileName = params.profileName?.trim()
    const profilePictureUrl = params.profilePictureUrl?.trim()

    if (profileName) {
      identity.profileName = profileName
    }
    if (profilePictureUrl) {
      identity.profilePictureUrl = profilePictureUrl
    }
    if (
      params.lastInteractionAt &&
      (!identity.lastInteractionAt ||
        params.lastInteractionAt > identity.lastInteractionAt)
    ) {
      identity.lastInteractionAt = params.lastInteractionAt
    }

    await identityRepo.save(identity)
  }

  private normalizeIdentityKey(
    identityKey: LeadChannelIdentityKey
  ): LeadChannelIdentityKey {
    const externalAccountId = identityKey.externalAccountId.trim()
    const externalUserId = identityKey.externalUserId.trim()

    if (!externalAccountId || !externalUserId) {
      throw new BadRequestException(
        'External account and user identifiers are required'
      )
    }

    return {
      channel: identityKey.channel,
      externalAccountId,
      externalUserId
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    )
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm'

import { FollowUpStep } from '../followup/entities/followup-step.entity'
import { FollowUp } from '../followup/entities/followup.entity'
import { Lead } from '../leads/entities/lead.entity'
import { Message } from '../leads/entities/message.entity'
import { NegotiationAttachment } from '../negotiation/entities/negotiation-attachment.entity'
import { NegotiationCost } from '../negotiation/entities/negotiation-cost.entity'
import { NegotiationPayment } from '../negotiation/entities/negotiation-payment.entity'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

const resources = {
  lead: { entity: Lead, path: [] },
  message: { entity: Message, path: [] },
  negotiation: { entity: Negotiation, path: ['lead'] },
  attachment: { entity: NegotiationAttachment, path: ['negotiation', 'lead'] },
  followUp: { entity: FollowUp, path: ['negotiation', 'lead'] },
  step: { entity: FollowUpStep, path: ['followUp', 'negotiation', 'lead'] },
  cost: {
    entity: NegotiationCost,
    path: ['negotiationFinancial', 'negotiation', 'lead']
  },
  payment: {
    entity: NegotiationPayment,
    path: ['negotiationFinancial', 'negotiation', 'lead']
  }
} satisfies Record<
  string,
  { entity: EntityTarget<ObjectLiteral>; path: string[] }
>

export type CompanyResource = keyof typeof resources

@Injectable()
export class CompanyAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async companyIdsForUser(userId: string): Promise<string[]> {
    const mappings = await this.dataSource
      .getRepository(UserInformations)
      .find({
        where: { userId },
        select: { companyId: true }
      })
    return [
      ...new Set(
        mappings
          .map((mapping) => mapping.companyId)
          .filter((companyId): companyId is string => Boolean(companyId))
      )
    ]
  }

  async assertResource(
    userId: string,
    resource: CompanyResource,
    id: string
  ): Promise<void> {
    const companyIds = await this.companyIdsForUser(userId)
    if (!companyIds.length) throw new NotFoundException('Resource not found')

    const definition = resources[resource]
    const query = this.dataSource
      .getRepository(definition.entity as EntityTarget<ObjectLiteral>)
      .createQueryBuilder('resource')
    let alias = 'resource'
    for (const [index, relation] of definition.path.entries()) {
      const nextAlias = `parent${index}`
      query.innerJoin(`${alias}.${relation}`, nextAlias)
      alias = nextAlias
    }
    if (resource === 'message') {
      query.innerJoin(
        Lead,
        'messageLead',
        'messageLead.id::text = resource."leadId"'
      )
      alias = 'messageLead'
    }
    const exists = await query
      .where('resource.id = :resourceId', { resourceId: id })
      .andWhere(`${alias}."companyId" IN (:...companyIds)`, { companyIds })
      .getExists()
    if (!exists) throw new NotFoundException('Resource not found')
  }
}

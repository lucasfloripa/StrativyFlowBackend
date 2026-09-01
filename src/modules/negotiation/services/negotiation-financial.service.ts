import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserInformations } from '../../user/entities/user-informations.entity'
import { CreateNegotiationFinancialDto } from '../dto/create-negotiation-financial.dto'
import { UpdateNegotiationFinancialDto } from '../dto/update-negotiation-financial.dto'
import { NegotiationFinancial } from '../entities/negotiation-financial.entity'
import { Negotiation } from '../entities/negotiation.entity'

@Injectable()
export class NegotiationFinancialService {
  constructor(
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(NegotiationFinancial)
    private readonly financialRepository: Repository<NegotiationFinancial>
  ) {}

  async findOne(
    userId: string,
    negotiationId: string
  ): Promise<NegotiationFinancial> {
    return await this.findOwnedFinancial(userId, negotiationId)
  }

  async create(
    userId: string,
    negotiationId: string,
    dto: CreateNegotiationFinancialDto
  ): Promise<NegotiationFinancial> {
    await this.assertOwnedNegotiation(userId, negotiationId)

    const existingFinancial = await this.financialRepository.findOne({
      where: { negotiationId },
      select: { id: true }
    })

    if (existingFinancial) {
      throw new ConflictException(
        'Negotiation financial information already exists'
      )
    }

    const financial = this.financialRepository.create({
      negotiationId,
      saleAmount: dto.saleAmount,
      discountAmount: dto.discountAmount ?? null
    })

    return await this.financialRepository.save(financial)
  }

  async update(
    userId: string,
    negotiationId: string,
    dto: UpdateNegotiationFinancialDto
  ): Promise<NegotiationFinancial> {
    const financial = await this.findOwnedFinancial(userId, negotiationId)

    if (dto.saleAmount !== undefined) {
      financial.saleAmount = dto.saleAmount
    }

    if (dto.discountAmount !== undefined) {
      financial.discountAmount = dto.discountAmount
    }

    return await this.financialRepository.save(financial)
  }

  async remove(
    userId: string,
    negotiationId: string
  ): Promise<NegotiationFinancial> {
    const financial = await this.findOwnedFinancial(userId, negotiationId)

    return await this.financialRepository.remove(financial)
  }

  async findOwnedFinancial(
    userId: string,
    negotiationId: string
  ): Promise<NegotiationFinancial> {
    await this.assertOwnedNegotiation(userId, negotiationId)

    const financial = await this.financialRepository.findOne({
      where: { negotiationId }
    })

    if (!financial) {
      throw new NotFoundException('Negotiation financial information not found')
    }

    return financial
  }

  private async assertOwnedNegotiation(
    userId: string,
    negotiationId: string
  ): Promise<void> {
    const negotiation = await this.negotiationRepository
      .createQueryBuilder('negotiation')
      .innerJoin('negotiation.lead', 'lead')
      .innerJoin(
        UserInformations,
        'userInformations',
        'CAST("userInformations"."id" AS text) = "lead"."userInformationsId"'
      )
      .where('negotiation.id = :negotiationId', { negotiationId })
      .andWhere('userInformations.userId = :userId', { userId })
      .getOne()

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found')
    }
  }
}

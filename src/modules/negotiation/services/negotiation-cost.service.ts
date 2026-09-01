import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateNegotiationCostDto } from '../dto/create-negotiation-cost.dto'
import { UpdateNegotiationCostDto } from '../dto/update-negotiation-cost.dto'
import { NegotiationCost } from '../entities/negotiation-cost.entity'

import { NegotiationFinancialService } from './negotiation-financial.service'

@Injectable()
export class NegotiationCostService {
  constructor(
    @InjectRepository(NegotiationCost)
    private readonly costRepository: Repository<NegotiationCost>,
    private readonly financialService: NegotiationFinancialService
  ) {}

  async findAll(
    userId: string,
    negotiationId: string
  ): Promise<NegotiationCost[]> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )

    return await this.costRepository.find({
      where: { negotiationFinancialId: financial.id },
      order: { createdAt: 'DESC' }
    })
  }

  async create(
    userId: string,
    negotiationId: string,
    dto: CreateNegotiationCostDto
  ): Promise<NegotiationCost> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )
    const description = dto.description.trim()

    if (!description) {
      throw new BadRequestException('description must not be empty')
    }

    const cost = this.costRepository.create({
      negotiationFinancialId: financial.id,
      description,
      type: dto.type,
      amount: dto.amount
    })

    return await this.costRepository.save(cost)
  }

  async update(
    userId: string,
    negotiationId: string,
    costId: string,
    dto: UpdateNegotiationCostDto
  ): Promise<NegotiationCost> {
    const cost = await this.findOwnedCost(userId, negotiationId, costId)

    if (dto.description !== undefined) {
      const description = dto.description.trim()

      if (!description) {
        throw new BadRequestException('description must not be empty')
      }

      cost.description = description
    }

    if (dto.type !== undefined) {
      cost.type = dto.type
    }

    if (dto.amount !== undefined) {
      cost.amount = dto.amount
    }

    return await this.costRepository.save(cost)
  }

  async remove(
    userId: string,
    negotiationId: string,
    costId: string
  ): Promise<{ success: true }> {
    const cost = await this.findOwnedCost(userId, negotiationId, costId)
    await this.costRepository.remove(cost)
    return { success: true }
  }

  private async findOwnedCost(
    userId: string,
    negotiationId: string,
    costId: string
  ): Promise<NegotiationCost> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )
    const cost = await this.costRepository.findOne({
      where: {
        id: costId,
        negotiationFinancialId: financial.id
      }
    })

    if (!cost) {
      throw new NotFoundException('Negotiation cost not found')
    }

    return cost
  }
}

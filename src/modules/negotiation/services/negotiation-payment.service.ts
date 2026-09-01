import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateNegotiationPaymentInstallmentsDto } from '../dto/create-negotiation-payment-installments.dto'
import { CreateNegotiationPaymentDto } from '../dto/create-negotiation-payment.dto'
import { UpdateNegotiationPaymentDto } from '../dto/update-negotiation-payment.dto'
import { NegotiationAttachment } from '../entities/negotiation-attachment.entity'
import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

import { NegotiationFinancialService } from './negotiation-financial.service'

@Injectable()
export class NegotiationPaymentService {
  constructor(
    @InjectRepository(NegotiationPayment)
    private readonly paymentRepository: Repository<NegotiationPayment>,
    private readonly financialService: NegotiationFinancialService,
    @InjectRepository(NegotiationAttachment)
    private readonly attachmentRepository: Repository<NegotiationAttachment>
  ) {}

  async findAll(
    userId: string,
    negotiationId: string
  ): Promise<NegotiationPayment[]> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )

    return await this.paymentRepository.find({
      where: { negotiationFinancialId: financial.id },
      order: { dueDate: 'ASC', createdAt: 'ASC' }
    })
  }

  async create(
    userId: string,
    negotiationId: string,
    dto: CreateNegotiationPaymentDto
  ): Promise<NegotiationPayment> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )
    await this.validateProofAttachment(negotiationId, dto.proofAttachmentId)

    const payment = this.paymentRepository.create({
      negotiationFinancialId: financial.id,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      dueDate: new Date(dto.dueDate),
      paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
      status: dto.status,
      proofAttachmentId: dto.proofAttachmentId ?? null
    })

    return await this.paymentRepository.save(payment)
  }

  async createInstallments(
    userId: string,
    negotiationId: string,
    dto: CreateNegotiationPaymentInstallmentsDto
  ): Promise<NegotiationPayment[]> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )

    const totalCents = Math.round(Number(dto.amount) * 100)
    const baseCents = Math.floor(totalCents / dto.installmentCount)
    const remainderCents = totalCents - baseCents * dto.installmentCount
    const firstDueDate = new Date(dto.dueDate)

    return await this.paymentRepository.manager.transaction(
      async (entityManager) => {
        const createdPayments: NegotiationPayment[] = []

        for (let index = 0; index < dto.installmentCount; index += 1) {
          const installmentCents = baseCents + (index < remainderCents ? 1 : 0)
          const dueDate = new Date(firstDueDate)
          dueDate.setMonth(dueDate.getMonth() + index)

          const payment = entityManager.create(NegotiationPayment, {
            negotiationFinancialId: financial.id,
            amount: (installmentCents / 100).toFixed(2),
            paymentMethod: dto.paymentMethod,
            dueDate,
            paidAt: null,
            status: NegotiationPaymentStatus.PENDING
          })

          createdPayments.push(await entityManager.save(payment))
        }

        return createdPayments
      }
    )
  }

  async update(
    userId: string,
    negotiationId: string,
    paymentId: string,
    dto: UpdateNegotiationPaymentDto
  ): Promise<NegotiationPayment> {
    const payment = await this.findOwnedPayment(
      userId,
      negotiationId,
      paymentId
    )

    await this.validateProofAttachment(negotiationId, dto.proofAttachmentId)

    if (dto.amount !== undefined) {
      payment.amount = dto.amount
    }

    if (dto.paymentMethod !== undefined) {
      payment.paymentMethod = dto.paymentMethod
    }

    if (dto.dueDate !== undefined) {
      payment.dueDate = new Date(dto.dueDate)
    }

    if (dto.paidAt !== undefined) {
      payment.paidAt = dto.paidAt ? new Date(dto.paidAt) : null
    }

    if (dto.status !== undefined) {
      payment.status = dto.status
    }

    if (dto.proofAttachmentId !== undefined) {
      payment.proofAttachmentId = dto.proofAttachmentId
    }

    return await this.paymentRepository.save(payment)
  }

  async remove(
    userId: string,
    negotiationId: string,
    paymentId: string
  ): Promise<{ success: true }> {
    const payment = await this.findOwnedPayment(
      userId,
      negotiationId,
      paymentId
    )
    await this.paymentRepository.remove(payment)
    return { success: true }
  }

  private async findOwnedPayment(
    userId: string,
    negotiationId: string,
    paymentId: string
  ): Promise<NegotiationPayment> {
    const financial = await this.financialService.findOwnedFinancial(
      userId,
      negotiationId
    )
    const payment = await this.paymentRepository.findOne({
      where: {
        id: paymentId,
        negotiationFinancialId: financial.id
      }
    })

    if (!payment) {
      throw new NotFoundException('Negotiation payment not found')
    }

    return payment
  }

  private async validateProofAttachment(
    negotiationId: string,
    proofAttachmentId: string | null | undefined
  ): Promise<void> {
    if (!proofAttachmentId) {
      return
    }

    const attachment = await this.attachmentRepository.findOne({
      where: {
        id: proofAttachmentId,
        negotiationId
      },
      select: { id: true }
    })

    if (!attachment) {
      throw new NotFoundException('Negotiation proof attachment not found')
    }
  }
}

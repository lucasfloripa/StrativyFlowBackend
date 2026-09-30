import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

@Injectable()
export class NegotiationPaymentStatusService {
  constructor(
    @InjectRepository(NegotiationPayment)
    private readonly paymentRepository: Repository<NegotiationPayment>
  ) {}

  async findOverduePaymentIds(): Promise<string[]> {
    const payments = await this.paymentRepository.find({
      select: { id: true },
      where: {
        status: NegotiationPaymentStatus.PENDING,
        dueDate: LessThan(this.getStartOfTodayUtc())
      }
    })

    return payments.map((payment) => payment.id)
  }

  async markPaymentOverdue(paymentId: string): Promise<number> {
    const result = await this.paymentRepository.update(
      {
        id: paymentId,
        status: NegotiationPaymentStatus.PENDING,
        dueDate: LessThan(this.getStartOfTodayUtc())
      },
      { status: NegotiationPaymentStatus.OVERDUE }
    )

    return result.affected ?? 0
  }

  private getStartOfTodayUtc(): Date {
    const now = new Date()

    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
  }
}

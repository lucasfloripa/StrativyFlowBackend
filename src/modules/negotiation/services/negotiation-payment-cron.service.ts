import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'

import {
  NegotiationPayment,
  NegotiationPaymentStatus
} from '../entities/negotiation-payment.entity'

@Injectable()
export class NegotiationPaymentCronService {
  private readonly logger = new Logger(NegotiationPaymentCronService.name)

  constructor(
    @InjectRepository(NegotiationPayment)
    private readonly paymentRepository: Repository<NegotiationPayment>
  ) {}

  @Cron('0 0 7 * * *', { waitForCompletion: true })
  async markOverduePayments(): Promise<void> {
    const now = new Date()
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )

    const result = await this.paymentRepository.update(
      {
        status: NegotiationPaymentStatus.PENDING,
        dueDate: LessThan(startOfToday)
      },
      { status: NegotiationPaymentStatus.OVERDUE }
    )

    this.logger.log(
      `Marked ${result.affected ?? 0} overdue negotiation payment(s)`
    )
  }
}

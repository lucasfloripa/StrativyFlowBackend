import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { NegotiationPaymentStatusService } from '../../modules/negotiation/services/negotiation-payment-status.service'
import { RabbitPublisherService } from '../../modules/rabbit/services/rabbit-publisher.service'

import {
  PAYMENT_MARK_OVERDUE_EVENT,
  PAYMENT_QUEUE
} from './payment-job.constants'

@Injectable()
export class PaymentScheduler {
  private readonly logger = new Logger(PaymentScheduler.name)

  constructor(
    private readonly paymentStatusService: NegotiationPaymentStatusService,
    private readonly rabbitPublisher: RabbitPublisherService
  ) {}

  @Cron('0 0 7 * * *', { waitForCompletion: true })
  async scheduleOverduePayments(): Promise<void> {
    const now = new Date()

    this.logger.debug(`Running overdue payments cron. now=${now.toISOString()}`)

    try {
      const paymentIds = await this.paymentStatusService.findOverduePaymentIds()

      if (paymentIds.length === 0) {
        this.logger.debug('No pending payments matched the overdue criteria')
        return
      }

      await this.rabbitPublisher.publishMany(
        paymentIds.map((paymentId) => ({
          routingKey: PAYMENT_MARK_OVERDUE_EVENT,
          payload: { paymentId }
        }))
      )

      this.logger.log(
        `Published ${PAYMENT_MARK_OVERDUE_EVENT} for ${paymentIds.length} payment(s) to ${PAYMENT_QUEUE}`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error'
      const trace = error instanceof Error ? error.stack : undefined
      this.logger.error(
        `Failed to schedule overdue payments. error=${message}`,
        trace
      )
    }
  }
}

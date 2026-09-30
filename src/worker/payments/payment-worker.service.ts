import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

import { NegotiationPaymentStatusService } from '../../modules/negotiation/services/negotiation-payment-status.service'
import { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'
import { RabbitConsumerService } from '../../modules/rabbit/services/rabbit-consumer.service'

import {
  PAYMENT_MARK_OVERDUE_EVENT,
  PAYMENT_QUEUE
} from './payment-job.constants'

@Injectable()
export class PaymentWorker implements OnModuleInit {
  private readonly logger = new Logger(PaymentWorker.name)

  constructor(
    private readonly rabbitConsumer: RabbitConsumerService,
    private readonly paymentStatusService: NegotiationPaymentStatusService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitConsumer.subscribe({
      queue: PAYMENT_QUEUE,
      routingKey: PAYMENT_MARK_OVERDUE_EVENT,
      handler: (message) => this.handlePaymentMarkOverdueJob(message)
    })

    this.logger.log(`Listening on ${PAYMENT_QUEUE}`)
  }

  private async handlePaymentMarkOverdueJob(
    message: RabbitMessage
  ): Promise<void> {
    if (message.event !== PAYMENT_MARK_OVERDUE_EVENT) {
      throw new Error(`Unsupported payment job: ${message.event}`)
    }

    const paymentId = this.getPaymentId(message.data)

    this.logger.log(
      `Received job: ${message.event} (eventId=${message.eventId}, paymentId=${paymentId})`
    )

    try {
      const affectedCount =
        await this.paymentStatusService.markPaymentOverdue(paymentId)

      this.logger.log(
        `Job ${message.event} completed (paymentId=${paymentId}, updated=${affectedCount})`
      )
    } catch (error) {
      this.logger.error(
        `Job ${message.event} failed (paymentId=${paymentId}, error=${error instanceof Error ? error.message : String(error)})`,
        error instanceof Error ? error.stack : undefined
      )
      throw error
    }
  }

  private getPaymentId(data: unknown): string {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('paymentId' in data) ||
      typeof data.paymentId !== 'string' ||
      !data.paymentId.trim()
    ) {
      throw new Error('payment.mark_overdue requires a paymentId')
    }

    return data.paymentId
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { EvolutionService } from '../evolution/evolution.service'
import { MailService } from '../mail/mail.service'
import {
  buildPaymentOverdueEmail,
  PaymentOverdueEmailItem
} from '../mail/templates/notification-email.templates'
import {
  NegotiationPayment,
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../negotiation/entities/negotiation-payment.entity'
import { NegotiationPaymentCronService } from '../negotiation/services/negotiation-payment-cron.service'
import {
  NotificationReferenceType,
  NotificationType as AppNotificationType
} from '../notification/entities/notification.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { NotificationService } from '../notification/notification.service'
import { UserInformations } from '../user/entities/user-informations.entity'

type PaymentRecipientGroup = {
  appEnabled: boolean
  emailRecipients: Set<string>
  whatsappRecipients: Set<string>
  referencePaymentId: string
  items: PaymentOverdueEmailItem[]
}

export type PaymentOverdueDispatchSummary = {
  source: 'cron' | 'manual'
  overduePayments: number
  usersGrouped: number
  usersNotified: number
  paymentsIncluded: number
}

const paymentMethodLabels: Record<NegotiationPaymentMethod, string> = {
  [NegotiationPaymentMethod.PIX]: 'Pix',
  [NegotiationPaymentMethod.CREDIT_CARD]: 'Crédito',
  [NegotiationPaymentMethod.DEBIT_CARD]: 'Débito',
  [NegotiationPaymentMethod.OTHER]: 'Outro'
}

@Injectable()
export class PaymentOverdueCronService {
  private readonly logger = new Logger(PaymentOverdueCronService.name)

  constructor(
    @InjectRepository(NegotiationPayment)
    private readonly paymentRepository: Repository<NegotiationPayment>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>,
    private readonly paymentStatusCronService: NegotiationPaymentCronService,
    private readonly mailService: MailService,
    private readonly evolutionService: EvolutionService,
    private readonly notificationService: NotificationService
  ) {}

  @Cron('0 0 7 * * *')
  async sendOverduePaymentReminders(): Promise<void> {
    await this.dispatchOverduePaymentReminders('cron')
  }

  async dispatchOverduePaymentReminders(
    source: 'cron' | 'manual' = 'cron'
  ): Promise<PaymentOverdueDispatchSummary> {
    this.logger.log(`Starting overdue payment reminder dispatch via ${source}`)

    await this.paymentStatusCronService.markOverduePayments()

    const payments = await this.paymentRepository.find({
      where: { status: NegotiationPaymentStatus.OVERDUE },
      relations: {
        negotiationFinancial: {
          negotiation: {
            lead: true
          }
        }
      },
      order: { dueDate: 'ASC' }
    })

    if (!payments.length) {
      this.logger.log('No overdue payments for reminder dispatch')
      return {
        source,
        overduePayments: 0,
        usersGrouped: 0,
        usersNotified: 0,
        paymentsIncluded: 0
      }
    }

    const userInformationsIds = Array.from(
      new Set(
        payments
          .map(
            (payment) =>
              payment.negotiationFinancial?.negotiation?.lead
                ?.userInformationsId
          )
          .filter(
            (value): value is string =>
              typeof value === 'string' && Boolean(value.trim())
          )
      )
    )
    const userInformationsList = userInformationsIds.length
      ? await this.userInformationsRepository.find({
          where: { id: In(userInformationsIds) }
        })
      : []
    const userInformationsById = new Map(
      userInformationsList.map((userInformations) => [
        userInformations.id,
        userInformations
      ])
    )
    const groupedByUser = new Map<string, PaymentRecipientGroup>()

    for (const payment of payments) {
      const lead = payment.negotiationFinancial?.negotiation?.lead
      const userInformationsId = lead?.userInformationsId?.trim()

      if (!lead || !userInformationsId) continue

      const userInformations = userInformationsById.get(userInformationsId)
      const userId = userInformations?.userId?.trim()

      if (!userInformations || !userId) continue

      const existingGroup = groupedByUser.get(userId) ?? {
        appEnabled: false,
        emailRecipients: new Set<string>(),
        whatsappRecipients: new Set<string>(),
        referencePaymentId: payment.id,
        items: []
      }
      const enabledChannels =
        userInformations.notificationPreferences?.[
          NotificationType.INSTALLMENT_OVERDUE
        ] ?? []

      existingGroup.appEnabled ||= enabledChannels.includes(
        NotificationChannel.APP
      )

      if (enabledChannels.includes(NotificationChannel.EMAIL)) {
        userInformations.notificationEmails.forEach((email) => {
          const normalizedEmail = email.trim().toLowerCase()
          if (normalizedEmail) {
            existingGroup.emailRecipients.add(normalizedEmail)
          }
        })
      }

      if (enabledChannels.includes(NotificationChannel.WHATSAPP)) {
        userInformations.notificationWhatsAppNumbers.forEach((number) => {
          const normalizedNumber = number.trim()
          if (normalizedNumber) {
            existingGroup.whatsappRecipients.add(normalizedNumber)
          }
        })
      }

      existingGroup.items.push({
        leadName: lead.name?.trim() || 'Lead sem nome',
        amount: Number(payment.amount),
        paymentMethod: paymentMethodLabels[payment.paymentMethod],
        dueDate: payment.dueDate
      })
      groupedByUser.set(userId, existingGroup)
    }

    let usersNotified = 0
    let paymentsIncluded = 0

    for (const [userId, group] of groupedByUser.entries()) {
      const emailRecipients = Array.from(group.emailRecipients)
      const whatsappRecipients = Array.from(group.whatsappRecipients)

      if (
        !group.appEnabled &&
        !emailRecipients.length &&
        !whatsappRecipients.length
      ) {
        this.logger.warn(
          `Skipping overdue payment reminder for user ${userId} because INSTALLMENT_OVERDUE channels are not configured`
        )
        continue
      }

      const paymentLabel =
        group.items.length === 1 ? 'pagamento vencido' : 'pagamentos vencidos'

      if (group.appEnabled) {
        await this.notificationService.createNotification({
          organizationId: null,
          userId,
          type: AppNotificationType.PAYMENT_OVERDUE,
          title: 'Pagamentos vencidos',
          description: `${group.items.length} ${paymentLabel}`,
          referenceType: NotificationReferenceType.PAYMENT,
          referenceId: group.referencePaymentId
        })
      }

      if (emailRecipients.length) {
        await this.mailService.send({
          from: 'Strativy Flow <no-reply@strativyflow.com>',
          to: emailRecipients,
          subject: 'Lista de pagamentos vencidos',
          html: buildPaymentOverdueEmail(group.items)
        })
      }

      if (whatsappRecipients.length) {
        const message = this.buildWhatsAppMessage(group.items)
        const results = await Promise.allSettled(
          whatsappRecipients.map((recipient) =>
            this.evolutionService.sendText(recipient, message)
          )
        )
        const successCount = results.filter(
          (result) => result.status === 'fulfilled'
        ).length

        this.logger.log(
          `INSTALLMENT_OVERDUE WhatsApp dispatch for user ${userId}: success=${successCount}/${whatsappRecipients.length}`
        )

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.warn(
              `Failed to send INSTALLMENT_OVERDUE WhatsApp notification to ${whatsappRecipients[index]} for user ${userId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
            )
          }
        })
      }

      usersNotified += 1
      paymentsIncluded += group.items.length
    }

    this.logger.log(`Finished overdue payment reminder dispatch via ${source}`)

    return {
      source,
      overduePayments: payments.length,
      usersGrouped: groupedByUser.size,
      usersNotified,
      paymentsIncluded
    }
  }

  private buildWhatsAppMessage(items: PaymentOverdueEmailItem[]): string {
    const paymentLabel =
      items.length === 1 ? 'pagamento vencido' : 'pagamentos vencidos'
    const lines = items.map(
      (item) =>
        `• ${item.leadName} — ${item.amount.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })} — venceu em ${item.dueDate.toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        })}`
    )

    return [
      `Pagamentos vencidos (${items.length} ${paymentLabel})`,
      '',
      ...lines
    ].join('\n')
  }
}

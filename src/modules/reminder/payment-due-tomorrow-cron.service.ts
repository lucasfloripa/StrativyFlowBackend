import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { And, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm'

import { EvolutionService } from '../evolution/evolution.service'
import { MailService } from '../mail/mail.service'
import {
  buildPaymentDueTomorrowEmail,
  PaymentDueTomorrowEmailItem
} from '../mail/templates/notification-email.templates'
import {
  NegotiationPayment,
  NegotiationPaymentMethod,
  NegotiationPaymentStatus
} from '../negotiation/entities/negotiation-payment.entity'
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
  items: PaymentDueTomorrowEmailItem[]
}

export type PaymentDueTomorrowDispatchSummary = {
  source: 'cron' | 'manual'
  pendingPaymentsDueTomorrow: number
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
export class PaymentDueTomorrowCronService {
  private readonly logger = new Logger(PaymentDueTomorrowCronService.name)

  constructor(
    @InjectRepository(NegotiationPayment)
    private readonly paymentRepository: Repository<NegotiationPayment>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>,
    private readonly mailService: MailService,
    private readonly evolutionService: EvolutionService,
    private readonly notificationService: NotificationService
  ) {}

  @Cron('0 0 7 * * *')
  async sendPaymentDueTomorrowReminders(): Promise<void> {
    await this.dispatchPaymentDueTomorrowReminders('cron')
  }

  async dispatchPaymentDueTomorrowReminders(
    source: 'cron' | 'manual' = 'cron',
    referenceDate: Date = new Date()
  ): Promise<PaymentDueTomorrowDispatchSummary> {
    this.logger.log(
      `Starting payment due tomorrow reminder dispatch via ${source}`
    )

    const tomorrowStart = new Date(referenceDate)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    tomorrowStart.setHours(0, 0, 0, 0)

    const tomorrowEnd = new Date(tomorrowStart)
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)

    const payments = await this.paymentRepository.find({
      where: {
        status: NegotiationPaymentStatus.PENDING,
        dueDate: And(MoreThanOrEqual(tomorrowStart), LessThan(tomorrowEnd))
      },
      relations: {
        negotiationFinancial: {
          negotiation: {
            lead: true
          }
        }
      },
      order: {
        dueDate: 'ASC'
      }
    })

    if (!payments.length) {
      this.logger.log('No pending payments due tomorrow for reminder dispatch')
      return {
        source,
        pendingPaymentsDueTomorrow: 0,
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
          NotificationType.INSTALLMENT_DUE_TOMORROW
        ] ?? []

      existingGroup.appEnabled ||= enabledChannels.includes(
        NotificationChannel.APP
      )

      if (enabledChannels.includes(NotificationChannel.EMAIL)) {
        userInformations.notificationEmails.forEach((email) => {
          const normalizedEmail = email.trim().toLowerCase()
          if (normalizedEmail)
            existingGroup.emailRecipients.add(normalizedEmail)
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
          `Skipping payment due tomorrow reminder for user ${userId} because INSTALLMENT_DUE_TOMORROW channels are not configured`
        )
        continue
      }

      const paymentLabel = group.items.length === 1 ? 'pagamento' : 'pagamentos'

      if (group.appEnabled) {
        await this.notificationService.createNotification({
          organizationId: null,
          userId,
          type: AppNotificationType.PAYMENT_DUE_TOMORROW,
          title: 'Pagamentos vencendo amanhã',
          description: `${group.items.length} ${paymentLabel} com vencimento amanhã`,
          referenceType: NotificationReferenceType.PAYMENT,
          referenceId: group.referencePaymentId
        })
      }

      if (emailRecipients.length) {
        await this.mailService.send({
          from: 'Strativy Flow <no-reply@strativyflow.com>',
          to: emailRecipients,
          subject: 'Pagamentos vencendo amanhã',
          html: buildPaymentDueTomorrowEmail(group.items)
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
          `INSTALLMENT_DUE_TOMORROW WhatsApp dispatch for user ${userId}: success=${successCount}/${whatsappRecipients.length}`
        )

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.warn(
              `Failed to send INSTALLMENT_DUE_TOMORROW WhatsApp notification to ${whatsappRecipients[index]} for user ${userId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
            )
          }
        })
      }

      usersNotified += 1
      paymentsIncluded += group.items.length
    }

    this.logger.log(
      `Finished payment due tomorrow reminder dispatch via ${source}`
    )

    return {
      source,
      pendingPaymentsDueTomorrow: payments.length,
      usersGrouped: groupedByUser.size,
      usersNotified,
      paymentsIncluded
    }
  }

  private buildWhatsAppMessage(items: PaymentDueTomorrowEmailItem[]): string {
    const paymentLabel = items.length === 1 ? 'pagamento' : 'pagamentos'
    const lines = items.map(
      (item) =>
        `• ${item.leadName} — ${item.amount.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })} — ${item.paymentMethod}`
    )

    return [
      `Pagamentos vencendo amanhã (${items.length} ${paymentLabel})`,
      '',
      ...lines
    ].join('\n')
  }
}

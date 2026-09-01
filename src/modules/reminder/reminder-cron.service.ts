import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, In, Repository } from 'typeorm'

import { EvolutionService } from '../evolution/evolution.service'
import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import { MailService } from '../mail/mail.service'
import { buildDailyFollowUpSummaryEmail } from '../mail/templates/notification-email.templates'
import {
  NotificationReferenceType,
  NotificationType as AppNotificationType
} from '../notification/entities/notification.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { NotificationService } from '../notification/notification.service'
import { UserInformations } from '../user/entities/user-informations.entity'

type ReminderRecipientGroup = {
  appEnabled: boolean
  emailRecipients: Set<string>
  whatsappRecipients: Set<string>
  referenceFollowUpId: string
  items: Array<{
    leadName: string
    followUpValue: string
    dueAt: Date
  }>
}

export type ReminderDispatchSummary = {
  source: 'cron' | 'manual'
  pendingFollowUpsDueToday: number
  usersGrouped: number
  usersNotified: number
  followUpsIncluded: number
}

@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name)

  constructor(
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>,
    private readonly mailService: MailService,
    private readonly evolutionService: EvolutionService,
    private readonly notificationService: NotificationService
  ) {}

  @Cron('0 0 7 * * *')
  async sendDailyFollowUpReminders(): Promise<void> {
    await this.dispatchDailyFollowUpReminders('cron')
  }

  async dispatchDailyFollowUpReminders(
    source: 'cron' | 'manual' = 'cron'
  ): Promise<ReminderDispatchSummary> {
    this.logger.log(`Starting daily follow-up reminder dispatch via ${source}`)

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    const followUps = await this.followUpRepository.find({
      where: {
        status: FollowUpStatus.PENDING,
        dueAt: Between(startOfDay, endOfDay)
      },
      relations: {
        negotiation: {
          lead: true
        }
      },
      order: {
        dueAt: 'ASC'
      }
    })

    if (!followUps.length) {
      this.logger.log('No pending follow-ups due today for reminder dispatch')
      return {
        source,
        pendingFollowUpsDueToday: 0,
        usersGrouped: 0,
        usersNotified: 0,
        followUpsIncluded: 0
      }
    }

    const userInformationsIds = Array.from(
      new Set(
        followUps
          .map((followUp) => followUp.negotiation?.lead?.userInformationsId)
          .filter(
            (value): value is string =>
              typeof value === 'string' && Boolean(value.trim())
          )
      )
    )

    if (!userInformationsIds.length) {
      this.logger.warn(
        'Skipping reminder dispatch because no user informations were found'
      )
      return {
        source,
        pendingFollowUpsDueToday: followUps.length,
        usersGrouped: 0,
        usersNotified: 0,
        followUpsIncluded: 0
      }
    }

    const userInformationsList = await this.userInformationsRepository.find({
      where: {
        id: In(userInformationsIds)
      }
    })

    const userInformationsById = new Map(
      userInformationsList.map((userInformations) => [
        userInformations.id,
        userInformations
      ])
    )

    const groupedByUser = new Map<string, ReminderRecipientGroup>()

    for (const followUp of followUps) {
      const lead = followUp.negotiation?.lead
      const userInformationsId = lead?.userInformationsId?.trim()

      if (!lead || !userInformationsId) {
        continue
      }

      const userInformations = userInformationsById.get(userInformationsId)
      const userId = userInformations?.userId?.trim()

      if (!userInformations || !userId) {
        continue
      }

      const existingGroup = groupedByUser.get(userId) ?? {
        appEnabled: false,
        emailRecipients: new Set<string>(),
        whatsappRecipients: new Set<string>(),
        referenceFollowUpId: followUp.id,
        items: []
      }

      const enabledChannels =
        userInformations.notificationPreferences?.[
          NotificationType.DAILY_FOLLOWUP_SUMMARY
        ] ?? []

      if (enabledChannels.includes(NotificationChannel.APP)) {
        existingGroup.appEnabled = true
      }

      if (enabledChannels.includes(NotificationChannel.EMAIL)) {
        for (const email of userInformations.notificationEmails) {
          const normalizedEmail = email.trim().toLowerCase()

          if (normalizedEmail) {
            existingGroup.emailRecipients.add(normalizedEmail)
          }
        }
      }

      if (enabledChannels.includes(NotificationChannel.WHATSAPP)) {
        for (const number of userInformations.notificationWhatsAppNumbers) {
          const normalizedNumber = number.trim()

          if (normalizedNumber) {
            existingGroup.whatsappRecipients.add(normalizedNumber)
          }
        }
      }

      existingGroup.items.push({
        leadName: lead.name?.trim() || 'Lead sem nome',
        followUpValue: followUp.value,
        dueAt: followUp.dueAt
      })

      groupedByUser.set(userId, existingGroup)
    }

    let usersNotified = 0
    let followUpsIncluded = 0

    for (const [userId, group] of groupedByUser.entries()) {
      const emailRecipients = Array.from(group.emailRecipients)
      const whatsappRecipients = Array.from(group.whatsappRecipients)

      if (
        !group.appEnabled &&
        !emailRecipients.length &&
        !whatsappRecipients.length
      ) {
        this.logger.warn(
          `Skipping daily follow-up reminder for user ${userId} because DAILY_FOLLOWUP_SUMMARY channels are not configured`
        )
        continue
      }

      if (group.appEnabled) {
        await this.notificationService.createNotification({
          organizationId: null,
          userId,
          type: AppNotificationType.DAILY_FOLLOWUP_SUMMARY,
          title: 'Lista Follow-Ups do dia',
          description: '',
          referenceType: NotificationReferenceType.FOLLOW_UP,
          referenceId: group.referenceFollowUpId
        })
      }

      if (emailRecipients.length) {
        await this.mailService.send({
          from: 'Strativy Flow <no-reply@strativyflow.com>',
          to: emailRecipients,
          subject: 'Lembrete de follow-ups do dia',
          html: buildDailyFollowUpSummaryEmail(group.items)
        })
      }

      if (whatsappRecipients.length) {
        const message = this.buildReminderWhatsAppMessage(group.items)
        const whatsappResults = await Promise.allSettled(
          whatsappRecipients.map((recipient) =>
            this.evolutionService.sendText(recipient, message)
          )
        )

        const successCount = whatsappResults.filter(
          (result) => result.status === 'fulfilled'
        ).length

        this.logger.log(
          `DAILY_FOLLOWUP_SUMMARY WhatsApp dispatch for user ${userId}: success=${successCount}/${whatsappRecipients.length}`
        )

        whatsappResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.logger.warn(
              `Failed to send DAILY_FOLLOWUP_SUMMARY WhatsApp notification to ${whatsappRecipients[index]} for user ${userId}: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
            )
          }
        })
      }

      usersNotified += 1
      followUpsIncluded += group.items.length

      this.logger.log(
        `Sent daily follow-up reminder to user ${userId} with ${group.items.length} follow-up(s)`
      )
    }

    this.logger.log(`Finished daily follow-up reminder dispatch via ${source}`)

    return {
      source,
      pendingFollowUpsDueToday: followUps.length,
      usersGrouped: groupedByUser.size,
      usersNotified,
      followUpsIncluded
    }
  }

  private buildReminderWhatsAppMessage(
    items: Array<{ leadName: string; followUpValue: string; dueAt: Date }>
  ): string {
    const lines = items.map((item) => {
      const dueAtLabel = item.dueAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      })

      return `- ${item.leadName}: ${item.followUpValue} (${dueAtLabel})`
    })

    return ['Follow-ups do dia', ...lines].join('\n')
  }
}

import { Repository } from 'typeorm'

import { FollowUp } from '../followup/entities/followup.entity'
import {
  NotificationReferenceType,
  NotificationType as AppNotificationType
} from '../notification/entities/notification.entity'
import { NotificationChannel, NotificationType } from '../notification/enums'
import { NotificationService } from '../notification/notification.service'
import { UserInformations } from '../user/entities/user-informations.entity'

import { ReminderCronService } from './reminder-cron.service'

describe('ReminderCronService', () => {
  it('creates one APP notification for the daily follow-up list', async () => {
    const dueAt = new Date('2026-08-27T10:00:00.000Z')
    const followUpRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'follow-up-id',
          value: 'Retornar contato',
          dueAt,
          negotiation: {
            lead: {
              name: 'Maria',
              userInformationsId: 'user-information-id'
            }
          }
        }
      ])
    } as unknown as Repository<FollowUp>
    const userInformationsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'user-information-id',
          userId: 'user-id',
          notificationEmails: [],
          notificationWhatsAppNumbers: [],
          notificationPreferences: {
            [NotificationType.DAILY_FOLLOWUP_SUMMARY]: [NotificationChannel.APP]
          }
        }
      ])
    } as unknown as Repository<UserInformations>
    const mailService = { send: jest.fn() }
    const evolutionService = { sendText: jest.fn() }
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined)
    } as unknown as NotificationService
    const service = new ReminderCronService(
      followUpRepository,
      userInformationsRepository,
      mailService as never,
      evolutionService as never,
      notificationService
    )

    const summary = await service.dispatchDailyFollowUpReminders('manual')

    expect(notificationService.createNotification).toHaveBeenCalledWith({
      organizationId: null,
      userId: 'user-id',
      type: AppNotificationType.DAILY_FOLLOWUP_SUMMARY,
      title: 'Lista Follow-Ups do dia',
      description: '',
      referenceType: NotificationReferenceType.FOLLOW_UP,
      referenceId: 'follow-up-id'
    })
    expect(mailService.send).not.toHaveBeenCalled()
    expect(evolutionService.sendText).not.toHaveBeenCalled()
    expect(summary.usersNotified).toBe(1)
    expect(summary.followUpsIncluded).toBe(1)
  })
})

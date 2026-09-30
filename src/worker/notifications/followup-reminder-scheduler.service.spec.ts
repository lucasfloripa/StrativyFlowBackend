import { FollowUpStepChannel } from '../../modules/followup/entities/followup-step.entity'
import { FollowUp } from '../../modules/followup/entities/followup.entity'

import { FollowUpReminderScheduler } from './followup-reminder-scheduler.service'
import { FOLLOWUP_REMINDER_1H_EVENT } from './notification-job.constants'

describe('FollowUpReminderScheduler', () => {
  it('marks eligible follow-ups as scheduled before publishing the event', async () => {
    const now = new Date('2026-09-29T12:00:00.000Z')
    jest.useFakeTimers().setSystemTime(now)
    const candidate = {
      followUpId: 'follow-up-1',
      followUpTitle: 'Retornar proposta',
      actionChannel: FollowUpStepChannel.WHATSAPP,
      actionType: null,
      userId: 'user-1',
      leadName: 'Cliente',
      userInformationsId: 'user-information-1'
    }
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([candidate])
    }
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const runInTransaction = (
      handler: (transactionManager: typeof manager) => Promise<void>
    ): Promise<void> => handler(manager)
    const dataSource = {
      transaction: jest.fn(runInTransaction)
    }
    const rabbitPublisher = {
      publish: jest.fn().mockResolvedValue(undefined)
    }
    const scheduler = new FollowUpReminderScheduler(
      dataSource as never,
      rabbitPublisher as never
    )

    await scheduler.scheduleOneHourFollowUpReminders()

    expect(manager.update).toHaveBeenCalledWith(
      FollowUp,
      { id: candidate.followUpId },
      { reminder1hScheduledAt: now }
    )
    expect(rabbitPublisher.publish).toHaveBeenCalledWith(
      FOLLOWUP_REMINDER_1H_EVENT,
      candidate
    )
    expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(
      rabbitPublisher.publish.mock.invocationCallOrder[0]
    )
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write')
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked')
    jest.useRealTimers()
  })
})

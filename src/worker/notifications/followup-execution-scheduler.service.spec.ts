import { FollowUpExecutionScheduler } from './followup-execution-scheduler.service'

describe('FollowUpExecutionScheduler', () => {
  it('processes ready follow-up steps directly through the executor', async () => {
    const now = new Date('2026-09-30T17:58:00.002Z')
    jest.useFakeTimers().setSystemTime(now)
    const followUpExecutor = {
      processReadyWork: jest.fn().mockResolvedValue(1)
    }
    const scheduler = new FollowUpExecutionScheduler(followUpExecutor as never)

    await scheduler.processFollowUps()

    expect(followUpExecutor.processReadyWork).toHaveBeenCalledWith(now)
    jest.useRealTimers()
  })
})

import { QueryRunner } from 'typeorm'

import { AddFollowUpReminder1hScheduledAt1790899200000 } from './1790899200000-AddFollowUpReminder1hScheduledAt'

describe('AddFollowUpReminder1hScheduledAt1790899200000', () => {
  it('adds the follow-up reminder scheduling timestamp', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddFollowUpReminder1hScheduledAt1790899200000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "followups" ADD "reminder1hScheduledAt" TIMESTAMP WITH TIME ZONE`
    )
  })
})

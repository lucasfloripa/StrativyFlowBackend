import { QueryRunner } from 'typeorm'

import { AddDailyFollowupSummaryNotification1788220800000 } from './1788220800000-AddDailyFollowupSummaryNotification'

describe('AddDailyFollowupSummaryNotification1788220800000', () => {
  it('adds the daily follow-up summary notification type', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddDailyFollowupSummaryNotification1788220800000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'DAILY_FOLLOWUP_SUMMARY'`
    )
  })

  it('removes the daily summary type and restores the previous enum', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddDailyFollowupSummaryNotification1788220800000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `DELETE FROM "notifications" WHERE "type" = 'DAILY_FOLLOWUP_SUMMARY'`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TYPE "notifications_type_enum" RENAME TO "notifications_type_enum_old"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notifications_type_enum" USING "type"::text::"notifications_type_enum"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      5,
      `DROP TYPE "notifications_type_enum_old"`
    )
  })
})

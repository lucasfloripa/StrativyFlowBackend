import { QueryRunner } from 'typeorm'

import { RemoveConversationWindowNotifications1790812800000 } from './1790812800000-RemoveConversationWindowNotifications'

describe('RemoveConversationWindowNotifications1790812800000', () => {
  it('removes conversation notifications, enum values and lead columns', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new RemoveConversationWindowNotifications1790812800000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `UPDATE "user_informations" SET "notificationPreferences" = "notificationPreferences" - 'CONVERSATION_EXPIRING_1H' - 'CONVERSATION_EXPIRED'`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `DELETE FROM "notifications" WHERE "type" IN ('CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'DAILY_FOLLOWUP_SUMMARY', 'PAYMENT_DUE_TOMORROW', 'PAYMENT_OVERDUE')`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationReminder1hSentAt"`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationReminder1hScheduledAt"`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationExpiredNotificationSentAt"`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationExpiredNotificationScheduledAt"`
    )
  })
})

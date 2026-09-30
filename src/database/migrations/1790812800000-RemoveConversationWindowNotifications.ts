import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveConversationWindowNotifications1790812800000 implements MigrationInterface {
  name = 'RemoveConversationWindowNotifications1790812800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_informations" SET "notificationPreferences" = "notificationPreferences" - 'CONVERSATION_EXPIRING_1H' - 'CONVERSATION_EXPIRED'`
    )
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "type" IN ('CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" RENAME TO "notifications_type_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'DAILY_FOLLOWUP_SUMMARY', 'PAYMENT_DUE_TOMORROW', 'PAYMENT_OVERDUE')`
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notifications_type_enum" USING "type"::text::"notifications_type_enum"`
    )
    await queryRunner.query(`DROP TYPE "notifications_type_enum_old"`)
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationReminder1hSentAt"`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationReminder1hScheduledAt"`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationExpiredNotificationSentAt"`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "conversationExpiredNotificationScheduledAt"`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversationReminder1hSentAt" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversationReminder1hScheduledAt" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversationExpiredNotificationSentAt" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversationExpiredNotificationScheduledAt" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" RENAME TO "notifications_type_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'DAILY_FOLLOWUP_SUMMARY', 'PAYMENT_DUE_TOMORROW', 'PAYMENT_OVERDUE', 'CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notifications_type_enum" USING "type"::text::"notifications_type_enum"`
    )
    await queryRunner.query(`DROP TYPE "notifications_type_enum_old"`)
  }
}

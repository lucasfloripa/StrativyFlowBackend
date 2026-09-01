import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDailyFollowupSummaryNotification1788220800000 implements MigrationInterface {
  name = 'AddDailyFollowupSummaryNotification1788220800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'DAILY_FOLLOWUP_SUMMARY'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "type" = 'DAILY_FOLLOWUP_SUMMARY'`
    )
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" RENAME TO "notifications_type_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notifications_type_enum" USING "type"::text::"notifications_type_enum"`
    )
    await queryRunner.query(`DROP TYPE "notifications_type_enum_old"`)
  }
}

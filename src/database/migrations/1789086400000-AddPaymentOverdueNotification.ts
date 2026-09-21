import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPaymentOverdueNotification1789086400000 implements MigrationInterface {
  name = 'AddPaymentOverdueNotification1789086400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'PAYMENT_OVERDUE'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "type" = 'PAYMENT_OVERDUE'`
    )
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" RENAME TO "notifications_type_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('LEAD_CREATED', 'MESSAGE_RECEIVED', 'FOLLOW_UP_REMINDER_1H', 'DAILY_FOLLOWUP_SUMMARY', 'PAYMENT_DUE_TOMORROW', 'CONVERSATION_EXPIRING_1H', 'CONVERSATION_EXPIRED')`
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notifications_type_enum" USING "type"::text::"notifications_type_enum"`
    )
    await queryRunner.query(`DROP TYPE "notifications_type_enum_old"`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFollowUpReminder1hScheduledAt1790899200000 implements MigrationInterface {
  name = 'AddFollowUpReminder1hScheduledAt1790899200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followups" ADD "reminder1hScheduledAt" TIMESTAMP WITH TIME ZONE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followups" DROP COLUMN "reminder1hScheduledAt"`
    )
  }
}

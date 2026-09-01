import { MigrationInterface, QueryRunner } from 'typeorm'

export class RenamePendingFollowUpActionStatusToScheduled1787875200000 implements MigrationInterface {
  name = 'RenamePendingFollowUpActionStatusToScheduled1787875200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ALTER COLUMN "status" SET DEFAULT 'scheduled'`
    )
    await queryRunner.query(
      `UPDATE "followup_actions" SET "status" = 'scheduled' WHERE "status" = 'pending'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "followup_actions" SET "status" = 'pending' WHERE "status" = 'scheduled'`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ALTER COLUMN "status" SET DEFAULT 'pending'`
    )
  }
}

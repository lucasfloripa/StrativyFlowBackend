import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddScheduledAtToFollowUpSteps1788912000000 implements MigrationInterface {
  name = 'AddScheduledAtToFollowUpSteps1788912000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD "scheduledAt" TIMESTAMP WITH TIME ZONE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "scheduledAt"`
    )
  }
}

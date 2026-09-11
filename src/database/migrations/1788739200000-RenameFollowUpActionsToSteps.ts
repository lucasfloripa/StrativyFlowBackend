import { MigrationInterface, QueryRunner } from 'typeorm'

export class RenameFollowUpActionsToSteps1788739200000 implements MigrationInterface {
  name = 'RenameFollowUpActionsToSteps1788739200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followup_actions" RENAME TO "followup_steps"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" RENAME CONSTRAINT "FK_followup_actions_reply_message" TO "FK_followup_steps_reply_message"`
    )
    await queryRunner.query(
      `ALTER INDEX "IDX_followup_actions_reply_message_id" RENAME TO "IDX_followup_steps_reply_message_id"`
    )
    await queryRunner.query(`ALTER TABLE "followup_steps" ADD "parentId" uuid`)
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD "actionType" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD "conditionType" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD "waitTime" integer`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD "waitUnit" character varying`
    )
    await queryRunner.query(`ALTER TABLE "followup_steps" ADD "result" jsonb`)
    await queryRunner.query(
      `UPDATE "followup_steps" SET "actionType" = "type" WHERE "type" IN ('send_message', 'send_email')`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ALTER COLUMN "status" SET DEFAULT 'pending'`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ADD CONSTRAINT "FK_followup_steps_parent" FOREIGN KEY ("parentId") REFERENCES "followup_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_followup_steps_parent_id" ON "followup_steps" ("parentId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_followup_steps_parent_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP CONSTRAINT "FK_followup_steps_parent"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" ALTER COLUMN "status" SET DEFAULT 'scheduled'`
    )
    await queryRunner.query(`ALTER TABLE "followup_steps" DROP COLUMN "result"`)
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "waitUnit"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "waitTime"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "conditionType"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "actionType"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" DROP COLUMN "parentId"`
    )
    await queryRunner.query(
      `ALTER INDEX "IDX_followup_steps_reply_message_id" RENAME TO "IDX_followup_actions_reply_message_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" RENAME CONSTRAINT "FK_followup_steps_reply_message" TO "FK_followup_actions_reply_message"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_steps" RENAME TO "followup_actions"`
    )
  }
}

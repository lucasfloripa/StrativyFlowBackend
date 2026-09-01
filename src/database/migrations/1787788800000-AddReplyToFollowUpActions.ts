import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddReplyToFollowUpActions1787788800000 implements MigrationInterface {
  name = 'AddReplyToFollowUpActions1787788800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ADD "replyMessageId" uuid`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ADD "replyContent" text`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ADD "replyType" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ADD "repliedAt" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" ADD CONSTRAINT "FK_followup_actions_reply_message" FOREIGN KEY ("replyMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_followup_actions_reply_message_id" ON "followup_actions" ("replyMessageId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_followup_actions_reply_message_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" DROP CONSTRAINT "FK_followup_actions_reply_message"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" DROP COLUMN "repliedAt"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" DROP COLUMN "replyType"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" DROP COLUMN "replyContent"`
    )
    await queryRunner.query(
      `ALTER TABLE "followup_actions" DROP COLUMN "replyMessageId"`
    )
  }
}

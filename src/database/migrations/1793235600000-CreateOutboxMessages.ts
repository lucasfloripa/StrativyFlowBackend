import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateOutboxMessages1793235600000 implements MigrationInterface {
  name = 'CreateOutboxMessages1793235600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "outbox_message_status_enum" AS ENUM ('pending', 'published')`
    )
    await queryRunner.query(
      `CREATE TABLE "outbox_messages" (
        "id" uuid NOT NULL,
        "routingKey" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" "outbox_message_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastError" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "publishedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_outbox_messages" PRIMARY KEY ("id")
      )`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_messages_pending_available_at" ON "outbox_messages" ("availableAt") WHERE "status" = 'pending'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_outbox_messages_pending_available_at"`
    )
    await queryRunner.query(`DROP TABLE "outbox_messages"`)
    await queryRunner.query(`DROP TYPE "outbox_message_status_enum"`)
  }
}

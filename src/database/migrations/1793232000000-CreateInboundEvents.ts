import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateInboundEvents1793232000000 implements MigrationInterface {
  name = 'CreateInboundEvents1793232000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "inbound_event_channel_enum" AS ENUM ('whatsapp', 'messenger', 'instagram')`
    )
    await queryRunner.query(
      `CREATE TYPE "inbound_event_kind_enum" AS ENUM ('message', 'status', 'reaction')`
    )
    await queryRunner.query(
      `CREATE TYPE "inbound_event_status_enum" AS ENUM ('pending', 'processing', 'processed', 'ignored', 'failed')`
    )
    await queryRunner.query(
      `CREATE TABLE "inbound_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel" "inbound_event_channel_enum" NOT NULL,
        "kind" "inbound_event_kind_enum" NOT NULL,
        "dedupeKey" character varying NOT NULL,
        "externalAccountId" character varying,
        "externalUserId" character varying,
        "conversationKey" character varying,
        "occurredAt" TIMESTAMP WITH TIME ZONE,
        "payload" jsonb NOT NULL,
        "status" "inbound_event_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastAttemptAt" TIMESTAMP WITH TIME ZONE,
        "processedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_inbound_events" PRIMARY KEY ("id")
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_inbound_events_channel_dedupe_key" ON "inbound_events" ("channel", "dedupeKey")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_inbound_events_status_received_at" ON "inbound_events" ("status", "receivedAt")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_inbound_events_status_received_at"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."UQ_inbound_events_channel_dedupe_key"`
    )
    await queryRunner.query(`DROP TABLE "inbound_events"`)
    await queryRunner.query(`DROP TYPE "inbound_event_status_enum"`)
    await queryRunner.query(`DROP TYPE "inbound_event_kind_enum"`)
    await queryRunner.query(`DROP TYPE "inbound_event_channel_enum"`)
  }
}

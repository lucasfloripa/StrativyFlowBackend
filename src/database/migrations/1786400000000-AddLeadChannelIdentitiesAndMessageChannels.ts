import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLeadChannelIdentitiesAndMessageChannels1786400000000 implements MigrationInterface {
  name = 'AddLeadChannelIdentitiesAndMessageChannels1786400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "lead_channel_enum" AS ENUM ('whatsapp', 'messenger', 'instagram')`
    )
    await queryRunner.query(
      `CREATE TYPE "message_channel_enum" AS ENUM ('whatsapp', 'messenger', 'instagram')`
    )
    await queryRunner.query(
      `CREATE TABLE "lead_channel_identities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "leadId" uuid NOT NULL,
        "channel" "lead_channel_enum" NOT NULL,
        "externalAccountId" character varying NOT NULL,
        "externalUserId" character varying NOT NULL,
        "profileName" character varying,
        "profilePictureUrl" character varying,
        "lastInteractionAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_channel_identities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lead_channel_identities_lead" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_lead_channel_identity" ON "lead_channel_identities" ("channel", "externalAccountId", "externalUserId")`
    )

    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "name" DROP NOT NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "phone" DROP NOT NULL`
    )

    await queryRunner.query(
      `ALTER TABLE "messages" ADD "channel" "message_channel_enum" NOT NULL DEFAULT 'whatsapp'`
    )

    const messagesTable = await queryRunner.getTable('messages')
    const whatsappMessageIdUnique = messagesTable?.uniques.find(
      (unique) =>
        unique.columnNames.length === 1 &&
        unique.columnNames[0] === 'whatsappMessageId'
    )
    if (whatsappMessageIdUnique) {
      await queryRunner.dropUniqueConstraint(
        'messages',
        whatsappMessageIdUnique
      )
    }
    const whatsappMessageIdIndex = messagesTable?.indices.find(
      (index) =>
        index.isUnique &&
        index.columnNames.length === 1 &&
        index.columnNames[0] === 'whatsappMessageId'
    )
    if (whatsappMessageIdIndex) {
      await queryRunner.dropIndex('messages', whatsappMessageIdIndex)
    }

    await queryRunner.renameColumn(
      'messages',
      'whatsappMessageId',
      'externalMessageId'
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_messages_channel_externalMessageId" ON "messages" ("channel", "externalMessageId")`
    )

    await queryRunner.query(
      `WITH latest_identity_per_lead AS (
        SELECT DISTINCT ON (lead.id)
          lead.id AS "leadId",
          user_info."phoneNumberId" AS "externalAccountId",
          message.metadata->>'from' AS "externalUserId",
          COALESCE(message."externalTimestamp", message."createdAt") AS "lastInteractionAt"
        FROM "leads" lead
        INNER JOIN "user_informations" user_info
          ON user_info.id = lead."userInformationsId"
        INNER JOIN "messages" message
          ON message."leadId" = lead.id::text
          AND message.direction = 'INBOUND'
          AND NULLIF(BTRIM(message.metadata->>'from'), '') IS NOT NULL
        WHERE NULLIF(BTRIM(user_info."phoneNumberId"), '') IS NOT NULL
        ORDER BY lead.id, message."createdAt" DESC
      ), identity_candidates AS (
        SELECT
          *,
          COUNT(*) OVER (
            PARTITION BY "externalAccountId", "externalUserId"
          ) AS "identityMatches"
        FROM latest_identity_per_lead
      )
      INSERT INTO "lead_channel_identities" (
        "leadId",
        "channel",
        "externalAccountId",
        "externalUserId",
        "lastInteractionAt"
      )
      SELECT
        "leadId",
        'whatsapp',
        "externalAccountId",
        "externalUserId",
        "lastInteractionAt"
      FROM identity_candidates
      WHERE "identityMatches" = 1
      ON CONFLICT ("channel", "externalAccountId", "externalUserId") DO NOTHING`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_messages_channel_externalMessageId"`
    )
    await queryRunner.renameColumn(
      'messages',
      'externalMessageId',
      'whatsappMessageId'
    )
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "UQ_messages_whatsappMessageId" UNIQUE ("whatsappMessageId")`
    )
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "channel"`)

    await queryRunner.query(`DROP TABLE "lead_channel_identities"`)
    await queryRunner.query(`DROP TYPE "message_channel_enum"`)
    await queryRunner.query(`DROP TYPE "lead_channel_enum"`)

    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "name" SET NOT NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "phone" SET NOT NULL`
    )
  }
}

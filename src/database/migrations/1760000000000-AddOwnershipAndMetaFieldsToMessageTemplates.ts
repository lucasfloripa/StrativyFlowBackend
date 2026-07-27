import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddOwnershipAndMetaFieldsToMessageTemplates1760000000000 implements MigrationInterface {
  name = 'AddOwnershipAndMetaFieldsToMessageTemplates1760000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "userInformationsId" uuid`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "metaTemplateId" text`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "metaTemplateName" text`
    )

    await queryRunner.query(
      `UPDATE "message_templates" SET "metaTemplateName" = COALESCE("metaTemplateName", "name")`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ALTER COLUMN "metaTemplateName" SET NOT NULL`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'pt_BR'`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "category" text`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`
    )

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_message_templates_userInformationsId_metaTemplateName" ON "message_templates" ("userInformationsId", "metaTemplateName")`
    )

    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "message_templates"
        ADD CONSTRAINT "FK_message_templates_userInformationsId"
        FOREIGN KEY ("userInformationsId") REFERENCES "user_informations"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP CONSTRAINT IF EXISTS "FK_message_templates_userInformationsId"`
    )

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_message_templates_userInformationsId_metaTemplateName"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "active"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "category"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "language"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "metaTemplateName"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "metaTemplateId"`
    )

    await queryRunner.query(
      `ALTER TABLE "message_templates" DROP COLUMN IF EXISTS "userInformationsId"`
    )
  }
}

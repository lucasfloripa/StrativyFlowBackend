import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTemplateTypeToMessages1786579200000 implements MigrationInterface {
  name = 'AddTemplateTypeToMessages1786579200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "templateType" character varying`
    )
    await queryRunner.query(
      `UPDATE "messages" message
       SET "templateType" = COALESCE(NULLIF(BTRIM(template.category), ''), 'UNKNOWN')
       FROM "message_templates" template
       WHERE message.source = 'template'
         AND message.metadata->>'templateId' = template.id::text`
    )
    await queryRunner.query(
      `UPDATE "messages"
       SET "templateType" = 'UNKNOWN'
       WHERE source = 'template'
         AND "templateType" IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "templateType"`)
  }
}

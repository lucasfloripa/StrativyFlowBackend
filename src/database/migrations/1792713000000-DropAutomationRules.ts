import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The rule-based automation feature was removed. Its table was never created
 * by a migration (it came from `synchronize`), so `up` uses `IF EXISTS` and
 * `down` recreates the table exactly as the removed entity described it.
 */
export class DropAutomationRules1792713000000 implements MigrationInterface {
  name = 'DropAutomationRules1792713000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "automation_rules"`)
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."automation_rules_triggertype_enum"`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."automation_rules_triggertype_enum" AS ENUM('ON_MESSAGE_RECEIVED', 'ON_LEAD_CREATED', 'ON_RUNTIME_MODE_CHANGED')`
    )
    await queryRunner.query(
      `CREATE TABLE "automation_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "triggerType" "public"."automation_rules_triggertype_enum" NOT NULL,
        "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_rules" PRIMARY KEY ("id")
      )`
    )
  }
}

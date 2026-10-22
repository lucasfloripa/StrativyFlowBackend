import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateCompanies1791244800000 implements MigrationInterface {
  name = 'CreateCompanies1791244800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "companies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )`
    )
    await queryRunner.query(`ALTER TABLE "leads" ADD "companyId" uuid`)
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "FK_leads_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_company" ON "leads" ("companyId")`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD "companyId" uuid`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD CONSTRAINT "FK_user_informations_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_user_informations_company" ON "user_informations" ("companyId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_informations_company"`)
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP CONSTRAINT "FK_user_informations_company"`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP COLUMN "companyId"`
    )
    await queryRunner.query(`DROP INDEX "IDX_leads_company"`)
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "FK_leads_company"`
    )
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "companyId"`)
    await queryRunner.query(`DROP TABLE "companies"`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCompanyAndInstagramToContacts1786754400000 implements MigrationInterface {
  name = 'AddCompanyAndInstagramToContacts1786754400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "company" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "instagram" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "instagram"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "company"`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWhatsAppFieldsToCompanies1791331200000 implements MigrationInterface {
  name = 'AddWhatsAppFieldsToCompanies1791331200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "companyPhoneNumber" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "companyPhoneNumberId" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "whatsappToken" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "whatsappToken"`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "companyPhoneNumberId"`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "companyPhoneNumber"`
    )
  }
}

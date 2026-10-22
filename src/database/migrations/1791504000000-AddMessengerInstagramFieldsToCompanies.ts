import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMessengerInstagramFieldsToCompanies1791504000000 implements MigrationInterface {
  name = 'AddMessengerInstagramFieldsToCompanies1791504000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "messenger_page_id" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "messenger_token" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "instagram_account_id" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "instagram_token" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "instagram_token"`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "instagram_account_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "messenger_token"`
    )
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "messenger_page_id"`
    )
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMessengerFieldsToUserInformations1786494000000 implements MigrationInterface {
  name = 'AddMessengerFieldsToUserInformations1786494000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD COLUMN IF NOT EXISTS "messenger_page_id" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD COLUMN IF NOT EXISTS "messenger_token" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP COLUMN IF EXISTS "messenger_token"`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP COLUMN IF EXISTS "messenger_page_id"`
    )
  }
}

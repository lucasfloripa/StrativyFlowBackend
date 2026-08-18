import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddInstagramFieldsToUserInformations1786582800000 implements MigrationInterface {
  name = 'AddInstagramFieldsToUserInformations1786582800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD COLUMN IF NOT EXISTS "instagram_account_id" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" ADD COLUMN IF NOT EXISTS "instagram_token" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP COLUMN IF EXISTS "instagram_token"`
    )
    await queryRunner.query(
      `ALTER TABLE "user_informations" DROP COLUMN IF EXISTS "instagram_account_id"`
    )
  }
}

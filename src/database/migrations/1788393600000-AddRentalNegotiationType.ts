import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRentalNegotiationType1788393600000 implements MigrationInterface {
  name = 'AddRentalNegotiationType1788393600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "negotiations_negotiationtype_enum" ADD VALUE IF NOT EXISTS 'rental'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "negotiations" SET "negotiationType" = NULL WHERE "negotiationType" = 'rental'`
    )
    await queryRunner.query(
      `ALTER TYPE "negotiations_negotiationtype_enum" RENAME TO "negotiations_negotiationtype_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "negotiations_negotiationtype_enum" AS ENUM ('service', 'product')`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiations" ALTER COLUMN "negotiationType" TYPE "negotiations_negotiationtype_enum" USING "negotiationType"::text::"negotiations_negotiationtype_enum"`
    )
    await queryRunner.query(`DROP TYPE "negotiations_negotiationtype_enum_old"`)
  }
}

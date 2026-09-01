import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddNegotiationStatus1788307200000 implements MigrationInterface {
  name = 'AddNegotiationStatus1788307200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "negotiations_status_enum" AS ENUM ('OPEN', 'WON', 'LOST')`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiations" ADD "status" "negotiations_status_enum"`
    )
    await queryRunner.query(
      `UPDATE "negotiations" SET "status" = CASE WHEN "stage"::text = 'WON' THEN 'WON'::"negotiations_status_enum" WHEN "stage"::text = 'LOST' THEN 'LOST'::"negotiations_status_enum" ELSE 'OPEN'::"negotiations_status_enum" END`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiations" ALTER COLUMN "status" SET NOT NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiations" ALTER COLUMN "status" SET DEFAULT 'OPEN'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "negotiations" DROP COLUMN "status"`)
    await queryRunner.query(`DROP TYPE "negotiations_status_enum"`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

const STATUS_TYPE_QUERY = `SELECT "udt_name" FROM "information_schema"."columns" WHERE "table_name" = 'messages' AND "column_name" = 'status' AND "table_schema" = current_schema()`

/**
 * Automatic replies are stored as `queued` before they are sent, and
 * `failed` when the Graph API refuses them. The enum type of
 * `messages.status` was created by `synchronize`, so its name is read from
 * the catalog instead of assumed.
 */
export class AddQueuedAndFailedMessageStatuses1793239200000 implements MigrationInterface {
  name = 'AddQueuedAndFailedMessageStatuses1793239200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statusType = await this.statusType(queryRunner)

    await queryRunner.query(
      `ALTER TYPE "${statusType}" ADD VALUE IF NOT EXISTS 'queued'`
    )
    await queryRunner.query(
      `ALTER TYPE "${statusType}" ADD VALUE IF NOT EXISTS 'failed'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statusType = await this.statusType(queryRunner)

    await queryRunner.query(
      `UPDATE "messages" SET "status" = NULL WHERE "status"::text IN ('queued', 'failed')`
    )
    await queryRunner.query(
      `ALTER TYPE "${statusType}" RENAME TO "${statusType}_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "${statusType}" AS ENUM ('sent', 'delivered', 'read', 'received')`
    )
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "status" TYPE "${statusType}" USING "status"::text::"${statusType}"`
    )
    await queryRunner.query(`DROP TYPE "${statusType}_old"`)
  }

  private async statusType(queryRunner: QueryRunner): Promise<string> {
    const rows = (await queryRunner.query(STATUS_TYPE_QUERY)) as Array<{
      udt_name: string
    }>
    const statusType = rows[0]?.udt_name

    if (!statusType || !/^[a-z0-9_]+$/.test(statusType)) {
      throw new Error('Could not find the enum type of "messages"."status"')
    }

    return statusType
  }
}

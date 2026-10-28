import { QueryRunner } from 'typeorm'

import { AddQueuedAndFailedMessageStatuses1793239200000 } from './1793239200000-AddQueuedAndFailedMessageStatuses'

describe('AddQueuedAndFailedMessageStatuses1793239200000', () => {
  const createQueryRunner = (
    typeName: string | null = 'messages_status_enum'
  ) =>
    ({
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('information_schema')
            ? typeName
              ? [{ udt_name: typeName }]
              : []
            : undefined
        )
      )
    }) as unknown as QueryRunner

  const statements = (queryRunner: QueryRunner) =>
    (queryRunner.query as jest.Mock).mock.calls
      .map(([sql]: [string]) => sql)
      .filter((sql) => !sql.includes('information_schema'))

  it('adds queued and failed to the enum type of messages.status', async () => {
    const queryRunner = createQueryRunner()

    await new AddQueuedAndFailedMessageStatuses1793239200000().up(queryRunner)

    expect(statements(queryRunner)).toEqual([
      `ALTER TYPE "messages_status_enum" ADD VALUE IF NOT EXISTS 'queued'`,
      `ALTER TYPE "messages_status_enum" ADD VALUE IF NOT EXISTS 'failed'`
    ])
  })

  it('uses the type name found in the catalog', async () => {
    const queryRunner = createQueryRunner('message_status_enum_custom')

    await new AddQueuedAndFailedMessageStatuses1793239200000().up(queryRunner)

    expect(statements(queryRunner)[0]).toBe(
      `ALTER TYPE "message_status_enum_custom" ADD VALUE IF NOT EXISTS 'queued'`
    )
  })

  it('refuses to run when the column type cannot be found', async () => {
    await expect(
      new AddQueuedAndFailedMessageStatuses1793239200000().up(
        createQueryRunner(null)
      )
    ).rejects.toThrow('Could not find the enum type of "messages"."status"')
  })

  it('recreates the enum without the new values on down', async () => {
    const queryRunner = createQueryRunner()

    await new AddQueuedAndFailedMessageStatuses1793239200000().down(queryRunner)

    expect(statements(queryRunner)).toEqual([
      `UPDATE "messages" SET "status" = NULL WHERE "status"::text IN ('queued', 'failed')`,
      `ALTER TYPE "messages_status_enum" RENAME TO "messages_status_enum_old"`,
      `CREATE TYPE "messages_status_enum" AS ENUM ('sent', 'delivered', 'read', 'received')`,
      `ALTER TABLE "messages" ALTER COLUMN "status" TYPE "messages_status_enum" USING "status"::text::"messages_status_enum"`,
      `DROP TYPE "messages_status_enum_old"`
    ])
  })
})

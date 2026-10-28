import { QueryRunner } from 'typeorm'

import { CreateOutboxMessages1793235600000 } from './1793235600000-CreateOutboxMessages'

describe('CreateOutboxMessages1793235600000', () => {
  const createQueryRunner = () =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  const calls = (queryRunner: QueryRunner) =>
    (queryRunner.query as jest.Mock).mock.calls.map(([sql]: [string]) => sql)

  it('creates the status enum, the outbox table and its partial index', async () => {
    const queryRunner = createQueryRunner()

    await new CreateOutboxMessages1793235600000().up(queryRunner)

    const sql = calls(queryRunner)
    expect(sql).toHaveLength(3)
    expect(sql[0]).toBe(
      `CREATE TYPE "outbox_message_status_enum" AS ENUM ('pending', 'published')`
    )
    expect(sql[1]).toContain('CREATE TABLE "outbox_messages"')
    expect(sql[1]).toContain('"id" uuid NOT NULL,')
    expect(sql[1]).toContain('"payload" jsonb NOT NULL')
    expect(sql[1]).toContain(
      `"status" "outbox_message_status_enum" NOT NULL DEFAULT 'pending'`
    )
    expect(sql[2]).toBe(
      `CREATE INDEX "IDX_outbox_messages_pending_available_at" ON "outbox_messages" ("availableAt") WHERE "status" = 'pending'`
    )
  })

  it('drops everything in reverse order', async () => {
    const queryRunner = createQueryRunner()

    await new CreateOutboxMessages1793235600000().down(queryRunner)

    expect(calls(queryRunner)).toEqual([
      `DROP INDEX "public"."IDX_outbox_messages_pending_available_at"`,
      `DROP TABLE "outbox_messages"`,
      `DROP TYPE "outbox_message_status_enum"`
    ])
  })
})

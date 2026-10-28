import { QueryRunner } from 'typeorm'

import { CreateInboundEvents1793232000000 } from './1793232000000-CreateInboundEvents'

describe('CreateInboundEvents1793232000000', () => {
  const createQueryRunner = () =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  const calls = (queryRunner: QueryRunner) =>
    (queryRunner.query as jest.Mock).mock.calls.map(([sql]: [string]) => sql)

  it('creates the enums, the inbox table and its indexes', async () => {
    const queryRunner = createQueryRunner()

    await new CreateInboundEvents1793232000000().up(queryRunner)

    const sql = calls(queryRunner)
    expect(sql).toHaveLength(6)
    expect(sql[0]).toBe(
      `CREATE TYPE "inbound_event_channel_enum" AS ENUM ('whatsapp', 'messenger', 'instagram')`
    )
    expect(sql[1]).toBe(
      `CREATE TYPE "inbound_event_kind_enum" AS ENUM ('message', 'status', 'reaction')`
    )
    expect(sql[2]).toBe(
      `CREATE TYPE "inbound_event_status_enum" AS ENUM ('pending', 'processing', 'processed', 'ignored', 'failed')`
    )
    expect(sql[3]).toContain('CREATE TABLE "inbound_events"')
    expect(sql[3]).toContain('"dedupeKey" character varying NOT NULL')
    expect(sql[3]).toContain('"payload" jsonb NOT NULL')
    expect(sql[3]).toContain(
      `"status" "inbound_event_status_enum" NOT NULL DEFAULT 'pending'`
    )
    expect(sql[4]).toBe(
      `CREATE UNIQUE INDEX "UQ_inbound_events_channel_dedupe_key" ON "inbound_events" ("channel", "dedupeKey")`
    )
    expect(sql[5]).toBe(
      `CREATE INDEX "IDX_inbound_events_status_received_at" ON "inbound_events" ("status", "receivedAt")`
    )
  })

  it('drops everything in reverse order', async () => {
    const queryRunner = createQueryRunner()

    await new CreateInboundEvents1793232000000().down(queryRunner)

    expect(calls(queryRunner)).toEqual([
      `DROP INDEX "public"."IDX_inbound_events_status_received_at"`,
      `DROP INDEX "public"."UQ_inbound_events_channel_dedupe_key"`,
      `DROP TABLE "inbound_events"`,
      `DROP TYPE "inbound_event_status_enum"`,
      `DROP TYPE "inbound_event_kind_enum"`,
      `DROP TYPE "inbound_event_channel_enum"`
    ])
  })
})

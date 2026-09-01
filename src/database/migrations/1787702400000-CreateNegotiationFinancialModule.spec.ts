import { QueryRunner } from 'typeorm'

import { CreateNegotiationFinancialModule1787702400000 } from './1787702400000-CreateNegotiationFinancialModule'

describe('CreateNegotiationFinancialModule1787702400000', () => {
  it('backfills legacy values before dropping the column', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateNegotiationFinancialModule1787702400000()

    await migration.up(queryRunner)

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]: [string]) => query
    )
    const backfillIndex = queries.findIndex((query) =>
      query.includes('INSERT INTO "negotiation_financials"')
    )
    const dropValueIndex = queries.findIndex((query) =>
      query.includes('DROP COLUMN "value"')
    )

    expect(backfillIndex).toBeGreaterThan(-1)
    expect(queries[backfillIndex]).toContain('WHERE "value" IS NOT NULL')
    expect(dropValueIndex).toBeGreaterThan(backfillIndex)
  })

  it('restores legacy values before dropping financial tables', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateNegotiationFinancialModule1787702400000()

    await migration.down(queryRunner)

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]: [string]) => query
    )
    const addValueIndex = queries.findIndex((query) =>
      query.includes('ADD "value" numeric(12,2)')
    )
    const restoreIndex = queries.findIndex((query) =>
      query.includes('SET "value" = financial."saleAmount"')
    )
    const dropFinancialsIndex = queries.findIndex((query) =>
      query.includes('DROP TABLE "negotiation_financials"')
    )

    expect(addValueIndex).toBeGreaterThan(-1)
    expect(restoreIndex).toBeGreaterThan(addValueIndex)
    expect(dropFinancialsIndex).toBeGreaterThan(restoreIndex)
  })
})

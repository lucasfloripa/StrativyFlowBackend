import { QueryRunner } from 'typeorm'

import { DropAutomationRules1792713000000 } from './1792713000000-DropAutomationRules'

describe('DropAutomationRules1792713000000', () => {
  const createQueryRunner = () =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  it('drops the automation rules table and its enum when they exist', async () => {
    const queryRunner = createQueryRunner()
    const migration = new DropAutomationRules1792713000000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `DROP TABLE IF EXISTS "automation_rules"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `DROP TYPE IF EXISTS "public"."automation_rules_triggertype_enum"`
    )
  })

  it('recreates the enum before the table on rollback', async () => {
    const queryRunner = createQueryRunner()
    const migration = new DropAutomationRules1792713000000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `CREATE TYPE "public"."automation_rules_triggertype_enum"`
      )
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE TABLE "automation_rules"')
    )
  })
})

import { QueryRunner } from 'typeorm'

import { CreateCompanies1791244800000 } from './1791244800000-CreateCompanies'

describe('CreateCompanies1791244800000', () => {
  it('creates companies and adds optional company relations to user information and leads', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateCompanies1791244800000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE "companies"')
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "user_informations" ADD "companyId" uuid`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('FK_user_informations_company')
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "leads" ADD "companyId" uuid`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('FK_leads_company')
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('ON DELETE SET NULL')
    )
  })

  it('removes the lead relation and companies table in reverse order', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateCompanies1791244800000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `DROP INDEX "IDX_user_informations_company"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TABLE "user_informations" DROP CONSTRAINT "FK_user_informations_company"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      `DROP INDEX "IDX_leads_company"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      5,
      `ALTER TABLE "leads" DROP CONSTRAINT "FK_leads_company"`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "user_informations" DROP COLUMN "companyId"`
    )
    expect(queryRunner.query).toHaveBeenLastCalledWith(`DROP TABLE "companies"`)
  })
})

import { QueryRunner } from 'typeorm'

import { AddCompanyAndInstagramToContacts1786754400000 } from './1786754400000-AddCompanyAndInstagramToContacts'

describe('AddCompanyAndInstagramToContacts1786754400000', () => {
  it('adds nullable company and instagram columns', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddCompanyAndInstagramToContacts1786754400000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "contacts" ADD "company" character varying`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TABLE "contacts" ADD "instagram" character varying`
    )
  })

  it('removes instagram and company columns', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddCompanyAndInstagramToContacts1786754400000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "contacts" DROP COLUMN "instagram"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TABLE "contacts" DROP COLUMN "company"`
    )
  })
})

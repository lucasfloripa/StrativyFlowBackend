import { QueryRunner } from 'typeorm'

import { AddMessengerInstagramFieldsToCompanies1791504000000 } from './1791504000000-AddMessengerInstagramFieldsToCompanies'

describe('AddMessengerInstagramFieldsToCompanies1791504000000', () => {
  const createQueryRunner = () =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  it('adds nullable Messenger and Instagram columns to companies', async () => {
    const queryRunner = createQueryRunner()

    await new AddMessengerInstagramFieldsToCompanies1791504000000().up(
      queryRunner
    )

    expect(queryRunner.query).toHaveBeenCalledTimes(4)
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "messenger_page_id" character varying`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "messenger_token" character varying`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "instagram_account_id" character varying`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "instagram_token" character varying`
    )
  })

  it('drops the added columns in reverse order', async () => {
    const queryRunner = createQueryRunner()

    await new AddMessengerInstagramFieldsToCompanies1791504000000().down(
      queryRunner
    )

    expect(queryRunner.query).toHaveBeenCalledTimes(4)
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "companies" DROP COLUMN "instagram_token"`
    )
    expect(queryRunner.query).toHaveBeenLastCalledWith(
      `ALTER TABLE "companies" DROP COLUMN "messenger_page_id"`
    )
  })
})

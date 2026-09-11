import { QueryRunner } from 'typeorm'

import { AddRentalNegotiationType1788393600000 } from './1788393600000-AddRentalNegotiationType'

describe('AddRentalNegotiationType1788393600000', () => {
  it('adds rental to the negotiation type enum', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddRentalNegotiationType1788393600000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TYPE "negotiations_negotiationtype_enum" ADD VALUE IF NOT EXISTS 'rental'`
    )
  })

  it('removes rental values before restoring the previous enum', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddRentalNegotiationType1788393600000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(5)
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`"negotiationType" = 'rental'`)
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`AS ENUM ('service', 'product')`)
    )
  })
})

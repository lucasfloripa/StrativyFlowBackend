import { QueryRunner } from 'typeorm'

import { AddPaymentDueTomorrowNotification1789000000000 } from './1789000000000-AddPaymentDueTomorrowNotification'

describe('AddPaymentDueTomorrowNotification1789000000000', () => {
  it('adds payment notification and reference enum values', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddPaymentDueTomorrowNotification1789000000000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'PAYMENT_DUE_TOMORROW'`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TYPE "notifications_referencetype_enum" ADD VALUE IF NOT EXISTS 'PAYMENT'`
    )
  })
})

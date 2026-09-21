import { QueryRunner } from 'typeorm'

import { AddPaymentOverdueNotification1789086400000 } from './1789086400000-AddPaymentOverdueNotification'

describe('AddPaymentOverdueNotification1789086400000', () => {
  it('adds the overdue payment notification enum value', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddPaymentOverdueNotification1789086400000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'PAYMENT_OVERDUE'`
    )
  })
})

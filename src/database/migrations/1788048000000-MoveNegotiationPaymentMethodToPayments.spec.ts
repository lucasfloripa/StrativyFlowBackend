import { QueryRunner } from 'typeorm'

import { MoveNegotiationPaymentMethodToPayments1788048000000 } from './1788048000000-MoveNegotiationPaymentMethodToPayments'

describe('MoveNegotiationPaymentMethodToPayments1788048000000', () => {
  it('adds paymentMethod to negotiation_payments before dropping it from negotiation_financials', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new MoveNegotiationPaymentMethodToPayments1788048000000()

    await migration.up(queryRunner)

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]: [string]) => query
    )
    const createPaymentsEnumIndex = queries.findIndex((query) =>
      query.includes(
        'CREATE TYPE "negotiation_payments_paymentMethod_enum" AS ENUM'
      )
    )
    const addPaymentsColumnIndex = queries.findIndex((query) =>
      query.includes(
        'ADD "paymentMethod" "negotiation_payments_paymentMethod_enum"'
      )
    )
    const dropFinancialsColumnIndex = queries.findIndex((query) =>
      query.includes(
        'ALTER TABLE "negotiation_financials" DROP COLUMN "paymentMethod"'
      )
    )
    const dropInstallmentCountIndex = queries.findIndex((query) =>
      query.includes(
        'ALTER TABLE "negotiation_financials" DROP COLUMN "installmentCount"'
      )
    )
    const dropFinancialsEnumIndex = queries.findIndex((query) =>
      query.includes('DROP TYPE "negotiation_financials_paymentMethod_enum"')
    )

    expect(createPaymentsEnumIndex).toBeGreaterThan(-1)
    expect(addPaymentsColumnIndex).toBeGreaterThan(createPaymentsEnumIndex)
    expect(dropFinancialsColumnIndex).toBeGreaterThan(addPaymentsColumnIndex)
    expect(dropInstallmentCountIndex).toBeGreaterThan(-1)
    expect(dropFinancialsEnumIndex).toBeGreaterThan(dropFinancialsColumnIndex)
  })

  it('restores negotiation_financials columns before dropping negotiation_payments column', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new MoveNegotiationPaymentMethodToPayments1788048000000()

    await migration.down(queryRunner)

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]: [string]) => query
    )
    const createFinancialsEnumIndex = queries.findIndex((query) =>
      query.includes(
        'CREATE TYPE "negotiation_financials_paymentMethod_enum" AS ENUM'
      )
    )
    const addFinancialsColumnIndex = queries.findIndex((query) =>
      query.includes(
        'ADD "paymentMethod" "negotiation_financials_paymentMethod_enum"'
      )
    )
    const dropPaymentsColumnIndex = queries.findIndex((query) =>
      query.includes(
        'ALTER TABLE "negotiation_payments" DROP COLUMN "paymentMethod"'
      )
    )
    const dropPaymentsEnumIndex = queries.findIndex((query) =>
      query.includes('DROP TYPE "negotiation_payments_paymentMethod_enum"')
    )

    expect(createFinancialsEnumIndex).toBeGreaterThan(-1)
    expect(addFinancialsColumnIndex).toBeGreaterThan(createFinancialsEnumIndex)
    expect(dropPaymentsColumnIndex).toBeGreaterThan(addFinancialsColumnIndex)
    expect(dropPaymentsEnumIndex).toBeGreaterThan(dropPaymentsColumnIndex)
  })
})

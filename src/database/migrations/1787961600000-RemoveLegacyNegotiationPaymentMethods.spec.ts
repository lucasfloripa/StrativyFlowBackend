import { QueryRunner } from 'typeorm'

import { RemoveLegacyNegotiationPaymentMethods1787961600000 } from './1787961600000-RemoveLegacyNegotiationPaymentMethods'

describe('RemoveLegacyNegotiationPaymentMethods1787961600000', () => {
  it('converts unsupported methods before recreating the enum', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new RemoveLegacyNegotiationPaymentMethods1787961600000()

    await migration.up(queryRunner)

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]: [string]) => query
    )
    const updateIndex = queries.findIndex((query) =>
      query.includes(`SET "paymentMethod" = 'OTHER'`)
    )
    const dropTypeIndex = queries.findIndex((query) =>
      query.includes('DROP TYPE "negotiation_financials_paymentMethod_enum"')
    )
    const createTypeQuery = queries.find((query) =>
      query.includes('CREATE TYPE "negotiation_financials_paymentMethod_enum"')
    )

    expect(updateIndex).toBeGreaterThan(-1)
    expect(dropTypeIndex).toBeGreaterThan(updateIndex)
    expect(createTypeQuery).toContain(
      "AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')"
    )
  })
})

import { QueryRunner } from 'typeorm'

import { AddNegotiationStatus1788307200000 } from './1788307200000-AddNegotiationStatus'

describe('AddNegotiationStatus1788307200000', () => {
  it('adds and populates the negotiation status from its stage', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddNegotiationStatus1788307200000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(5)
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`WHEN "stage"::text = 'WON' THEN 'WON'`)
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`WHEN "stage"::text = 'LOST' THEN 'LOST'`)
    )
  })
})

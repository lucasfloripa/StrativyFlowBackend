import { QueryRunner } from 'typeorm'

import { AddScheduledAtToFollowUpSteps1788912000000 } from './1788912000000-AddScheduledAtToFollowUpSteps'

describe('AddScheduledAtToFollowUpSteps1788912000000', () => {
  const createQueryRunner = (): QueryRunner =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  it('adds a nullable timestamptz scheduledAt column', async () => {
    const queryRunner = createQueryRunner()

    await new AddScheduledAtToFollowUpSteps1788912000000().up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "followup_steps" ADD "scheduledAt" TIMESTAMP WITH TIME ZONE`
    )
  })

  it('drops the scheduledAt column on rollback', async () => {
    const queryRunner = createQueryRunner()

    await new AddScheduledAtToFollowUpSteps1788912000000().down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "followup_steps" DROP COLUMN "scheduledAt"`
    )
  })
})

import { QueryRunner } from 'typeorm'

import { RenameFollowUpActionsToSteps1788739200000 } from './1788739200000-RenameFollowUpActionsToSteps'

describe('RenameFollowUpActionsToSteps1788739200000', () => {
  const createQueryRunner = (): QueryRunner =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  it('renames the table and adds the Step structure', async () => {
    const queryRunner = createQueryRunner()
    const migration = new RenameFollowUpActionsToSteps1788739200000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "followup_actions" RENAME TO "followup_steps"`
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `"FK_followup_actions_reply_message" TO "FK_followup_steps_reply_message"`
      )
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        `"IDX_followup_actions_reply_message_id" RENAME TO "IDX_followup_steps_reply_message_id"`
      )
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `UPDATE "followup_steps" SET "actionType" = "type" WHERE "type" IN ('send_message', 'send_email')`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `ADD CONSTRAINT "FK_followup_steps_parent" FOREIGN KEY ("parentId")`
      )
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`SET DEFAULT 'pending'`)
    )
  })

  it('restores the previous table and database object names', async () => {
    const queryRunner = createQueryRunner()
    const migration = new RenameFollowUpActionsToSteps1788739200000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `"IDX_followup_steps_reply_message_id" RENAME TO "IDX_followup_actions_reply_message_id"`
      )
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `"FK_followup_steps_reply_message" TO "FK_followup_actions_reply_message"`
      )
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "followup_steps" RENAME TO "followup_actions"`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`DROP CONSTRAINT "FK_followup_steps_parent"`)
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`SET DEFAULT 'scheduled'`)
    )
  })
})

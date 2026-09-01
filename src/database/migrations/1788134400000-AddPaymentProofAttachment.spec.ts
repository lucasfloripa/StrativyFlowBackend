import { QueryRunner } from 'typeorm'

import { AddPaymentProofAttachment1788134400000 } from './1788134400000-AddPaymentProofAttachment'

describe('AddPaymentProofAttachment1788134400000', () => {
  it('adds the nullable proof attachment column, index and foreign key', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddPaymentProofAttachment1788134400000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "negotiation_payments" ADD "proofAttachmentId" uuid'
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'CREATE INDEX "IDX_negotiation_payments_proof_attachment" ON "negotiation_payments" ("proofAttachmentId")'
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'ALTER TABLE "negotiation_payments" ADD CONSTRAINT "FK_negotiation_payments_proof_attachment" FOREIGN KEY ("proofAttachmentId") REFERENCES "negotiation_attachments"("id") ON DELETE SET NULL'
    )
  })

  it('removes the foreign key, index and column in dependency order', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new AddPaymentProofAttachment1788134400000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "negotiation_payments" DROP CONSTRAINT "FK_negotiation_payments_proof_attachment"'
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'DROP INDEX "public"."IDX_negotiation_payments_proof_attachment"'
    )
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'ALTER TABLE "negotiation_payments" DROP COLUMN "proofAttachmentId"'
    )
  })
})

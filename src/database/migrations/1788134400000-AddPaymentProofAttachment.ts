import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPaymentProofAttachment1788134400000 implements MigrationInterface {
  name = 'AddPaymentProofAttachment1788134400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" ADD "proofAttachmentId" uuid`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_negotiation_payments_proof_attachment" ON "negotiation_payments" ("proofAttachmentId")`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" ADD CONSTRAINT "FK_negotiation_payments_proof_attachment" FOREIGN KEY ("proofAttachmentId") REFERENCES "negotiation_attachments"("id") ON DELETE SET NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" DROP CONSTRAINT "FK_negotiation_payments_proof_attachment"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."IDX_negotiation_payments_proof_attachment"`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" DROP COLUMN "proofAttachmentId"`
    )
  }
}

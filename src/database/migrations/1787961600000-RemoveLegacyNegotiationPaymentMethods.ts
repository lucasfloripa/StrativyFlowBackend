import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveLegacyNegotiationPaymentMethods1787961600000 implements MigrationInterface {
  name = 'RemoveLegacyNegotiationPaymentMethods1787961600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials" ALTER COLUMN "paymentMethod" TYPE character varying USING "paymentMethod"::text`
    )
    await queryRunner.query(
      `UPDATE "negotiation_financials"
       SET "paymentMethod" = 'OTHER'
       WHERE "paymentMethod" IS NOT NULL
         AND "paymentMethod" NOT IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')`
    )
    await queryRunner.query(
      `DROP TYPE "negotiation_financials_paymentMethod_enum"`
    )
    await queryRunner.query(
      `CREATE TYPE "negotiation_financials_paymentMethod_enum" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials"
       ALTER COLUMN "paymentMethod" TYPE "negotiation_financials_paymentMethod_enum"
       USING "paymentMethod"::"negotiation_financials_paymentMethod_enum"`
    )
  }

  public async down(): Promise<void> {}
}

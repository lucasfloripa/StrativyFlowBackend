import { MigrationInterface, QueryRunner } from 'typeorm'

export class MoveNegotiationPaymentMethodToPayments1788048000000 implements MigrationInterface {
  name = 'MoveNegotiationPaymentMethodToPayments1788048000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "negotiation_payments_paymentMethod_enum" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" ADD "paymentMethod" "negotiation_payments_paymentMethod_enum" NOT NULL DEFAULT 'OTHER'`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" ALTER COLUMN "paymentMethod" DROP DEFAULT`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials" DROP COLUMN "paymentMethod"`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials" DROP COLUMN "installmentCount"`
    )
    await queryRunner.query(
      `DROP TYPE "negotiation_financials_paymentMethod_enum"`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "negotiation_financials_paymentMethod_enum" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials" ADD "paymentMethod" "negotiation_financials_paymentMethod_enum"`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_financials" ADD "installmentCount" integer`
    )
    await queryRunner.query(
      `ALTER TABLE "negotiation_payments" DROP COLUMN "paymentMethod"`
    )
    await queryRunner.query(
      `DROP TYPE "negotiation_payments_paymentMethod_enum"`
    )
  }
}

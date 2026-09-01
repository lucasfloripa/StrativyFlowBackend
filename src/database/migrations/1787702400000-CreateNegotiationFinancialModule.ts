import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateNegotiationFinancialModule1787702400000 implements MigrationInterface {
  name = 'CreateNegotiationFinancialModule1787702400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "negotiation_financials_paymentMethod_enum" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'OTHER')`
    )
    await queryRunner.query(
      `CREATE TYPE "negotiation_costs_type_enum" AS ENUM ('PRODUCT', 'SERVICE', 'COMMISSION', 'TAX', 'FREIGHT', 'FEE', 'OTHER')`
    )
    await queryRunner.query(
      `CREATE TYPE "negotiation_payments_status_enum" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELED')`
    )
    await queryRunner.query(
      `CREATE TABLE "negotiation_financials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "negotiationId" uuid NOT NULL,
        "saleAmount" numeric(12,2) NOT NULL,
        "discountAmount" numeric(12,2),
        "paymentMethod" "negotiation_financials_paymentMethod_enum",
        "installmentCount" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_negotiation_financials" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_negotiation_financials_negotiation" UNIQUE ("negotiationId"),
        CONSTRAINT "FK_negotiation_financials_negotiation" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE CASCADE
      )`
    )
    await queryRunner.query(
      `CREATE TABLE "negotiation_costs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "negotiationFinancialId" uuid NOT NULL,
        "description" character varying NOT NULL,
        "type" "negotiation_costs_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_negotiation_costs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_negotiation_costs_financial" FOREIGN KEY ("negotiationFinancialId") REFERENCES "negotiation_financials"("id") ON DELETE CASCADE
      )`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_negotiation_costs_financial" ON "negotiation_costs" ("negotiationFinancialId")`
    )
    await queryRunner.query(
      `CREATE TABLE "negotiation_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "negotiationFinancialId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "dueDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "status" "negotiation_payments_status_enum" NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_negotiation_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_negotiation_payments_financial" FOREIGN KEY ("negotiationFinancialId") REFERENCES "negotiation_financials"("id") ON DELETE CASCADE
      )`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_negotiation_payments_financial" ON "negotiation_payments" ("negotiationFinancialId")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_negotiation_payments_due_date" ON "negotiation_payments" ("dueDate")`
    )
    await queryRunner.query(
      `INSERT INTO "negotiation_financials" ("id", "negotiationId", "saleAmount", "createdAt", "updatedAt")
       SELECT uuid_generate_v4(), "id", "value", now(), now()
       FROM "negotiations"
       WHERE "value" IS NOT NULL`
    )
    await queryRunner.query(`ALTER TABLE "negotiations" DROP COLUMN "value"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negotiations" ADD "value" numeric(12,2)`
    )
    await queryRunner.query(
      `UPDATE "negotiations" negotiation
       SET "value" = financial."saleAmount"
       FROM "negotiation_financials" financial
       WHERE financial."negotiationId" = negotiation."id"`
    )
    await queryRunner.query(`DROP TABLE "negotiation_payments"`)
    await queryRunner.query(`DROP TABLE "negotiation_costs"`)
    await queryRunner.query(`DROP TABLE "negotiation_financials"`)
    await queryRunner.query(`DROP TYPE "negotiation_payments_status_enum"`)
    await queryRunner.query(`DROP TYPE "negotiation_costs_type_enum"`)
    await queryRunner.query(
      `DROP TYPE "negotiation_financials_paymentMethod_enum"`
    )
  }
}

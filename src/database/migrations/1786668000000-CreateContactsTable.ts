import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateContactsTable1786668000000 implements MigrationInterface {
  name = 'CreateContactsTable1786668000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userInformationsId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "phone" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_contacts_user_informations_phone" UNIQUE ("userInformationsId", "phone"),
        CONSTRAINT "FK_contacts_user_informations" FOREIGN KEY ("userInformationsId") REFERENCES "user_informations"("id") ON DELETE CASCADE
      )`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contacts"`)
  }
}

import { QueryRunner } from 'typeorm'

import { AddWhatsAppFieldsToCompanies1791331200000 } from './1791331200000-AddWhatsAppFieldsToCompanies'

describe('AddWhatsAppFieldsToCompanies1791331200000', () => {
  const createQueryRunner = () =>
    ({
      query: jest.fn().mockResolvedValue(undefined)
    }) as unknown as QueryRunner

  it('adds nullable WhatsApp columns to companies', async () => {
    const queryRunner = createQueryRunner()

    await new AddWhatsAppFieldsToCompanies1791331200000().up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(3)
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "companyPhoneNumber" character varying`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "companyPhoneNumberId" character varying`
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" ADD "whatsappToken" character varying`
    )
  })

  it('drops the WhatsApp columns', async () => {
    const queryRunner = createQueryRunner()

    await new AddWhatsAppFieldsToCompanies1791331200000().down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(3)
    expect(queryRunner.query).toHaveBeenCalledWith(
      `ALTER TABLE "companies" DROP COLUMN "whatsappToken"`
    )
  })
})

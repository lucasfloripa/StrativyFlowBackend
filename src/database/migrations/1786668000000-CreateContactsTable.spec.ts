import { QueryRunner } from 'typeorm'

import { CreateContactsTable1786668000000 } from './1786668000000-CreateContactsTable'

describe('CreateContactsTable1786668000000', () => {
  it('creates Contacts with ownership, timestamps, and phone uniqueness', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateContactsTable1786668000000()

    await migration.up(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(1)
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE "contacts"')
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UNIQUE ("userInformationsId", "phone")')
    )
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FOREIGN KEY ("userInformationsId") REFERENCES "user_informations"("id")'
      )
    )
  })

  it('drops the Contacts table', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined)
    } as unknown as QueryRunner
    const migration = new CreateContactsTable1786668000000()

    await migration.down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledWith(`DROP TABLE "contacts"`)
  })
})

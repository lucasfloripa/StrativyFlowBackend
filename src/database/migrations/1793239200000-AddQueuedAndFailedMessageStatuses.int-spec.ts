import {
  createIntegrationDatabase,
  describeWithDatabase
} from '../../testing/integration-database'

import { AddQueuedAndFailedMessageStatuses1793239200000 } from './1793239200000-AddQueuedAndFailedMessageStatuses'

import type { DataSource } from 'typeorm'

/** The `messages.status` column as `synchronize` created it. */
class CreateLegacyMessagesTable {
  async up(queryRunner: { query: (sql: string) => Promise<unknown> }) {
    await queryRunner.query(
      `CREATE TYPE "messages_status_enum" AS ENUM ('sent', 'delivered', 'read', 'received')`
    )
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" serial PRIMARY KEY, "status" "messages_status_enum")`
    )
  }
  down() {
    return Promise.resolve()
  }
}

const statusValues = async (dataSource: DataSource): Promise<string[]> => {
  const rows = await dataSource.query<Array<{ value: string }>>(
    `SELECT unnest(enum_range(NULL::"messages_status_enum"))::text AS value`
  )
  return rows.map((row) => row.value)
}

describeWithDatabase('AddQueuedAndFailedMessageStatuses (Postgres)', () => {
  let dataSource: DataSource
  let destroy: () => Promise<void>

  beforeAll(async () => {
    const database = await createIntegrationDatabase({
      entities: [],
      migrations: [CreateLegacyMessagesTable]
    })
    dataSource = database.dataSource
    destroy = database.destroy
  })

  afterAll(() => destroy())

  it('adds the values inside a migration transaction, idempotently, and reverts', async () => {
    const migration = new AddQueuedAndFailedMessageStatuses1793239200000()
    const run = async (step: 'up' | 'down') => {
      const queryRunner = dataSource.createQueryRunner()
      await queryRunner.startTransaction()
      try {
        await migration[step](queryRunner)
        await queryRunner.commitTransaction()
      } catch (error) {
        await queryRunner.rollbackTransaction()
        throw error
      } finally {
        await queryRunner.release()
      }
    }

    await run('up')
    await run('up')
    expect(await statusValues(dataSource)).toEqual([
      'sent',
      'delivered',
      'read',
      'received',
      'queued',
      'failed'
    ])

    await dataSource.query(
      `INSERT INTO "messages" ("status") VALUES ('queued'), ('sent'), ('failed')`
    )
    await run('down')

    expect(await statusValues(dataSource)).toEqual([
      'sent',
      'delivered',
      'read',
      'received'
    ])
    expect(
      await dataSource.query<unknown[]>(
        `SELECT "status" FROM "messages" ORDER BY "id"`
      )
    ).toEqual([{ status: null }, { status: 'sent' }, { status: null }])
  })
})

import { randomUUID } from 'crypto'

import { DataSource } from 'typeorm'

import { installTransactionalRepositories } from '../database/transaction-context'

import type { EntitySchema, MigrationInterface, MixedList } from 'typeorm'

/**
 * Integration tests (`*.int-spec.ts`, `npm run test:int`) run against the
 * Postgres in `TEST_DATABASE_URL`. Without it they are skipped, so the
 * command stays green on machines without a database.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

export const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip

type IntegrationDatabase = {
  dataSource: DataSource
  /** Drops the schema created for this test file and closes the pool. */
  destroy(): Promise<void>
}

/**
 * Connects to `TEST_DATABASE_URL` with a schema of its own (so files can run
 * in parallel and leave nothing behind) and runs the given migrations in it.
 */
export async function createIntegrationDatabase(options: {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  entities: MixedList<Function | string | EntitySchema>
  migrations: Array<new () => MigrationInterface>
}): Promise<IntegrationDatabase> {
  installTransactionalRepositories()

  const schema = `it_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const admin = new DataSource({ type: 'postgres', url: TEST_DATABASE_URL })
  await admin.initialize()
  await admin.query(`CREATE SCHEMA "${schema}"`)
  await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  await admin.destroy()

  const dataSource = new DataSource({
    type: 'postgres',
    url: TEST_DATABASE_URL,
    schema,
    entities: options.entities,
    synchronize: false,
    extra: { options: `-c search_path=${schema},public`, max: 10 }
  })
  await dataSource.initialize()

  const queryRunner = dataSource.createQueryRunner()
  try {
    for (const Migration of options.migrations) {
      await new Migration().up(queryRunner)
    }
  } finally {
    await queryRunner.release()
  }

  return {
    dataSource,
    destroy: async () => {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`)
      await dataSource.destroy()
    }
  }
}

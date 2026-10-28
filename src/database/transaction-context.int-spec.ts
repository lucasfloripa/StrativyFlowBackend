import { OutboxMessage } from '../modules/outbox/entities/outbox-message.entity'
import {
  createIntegrationDatabase,
  describeWithDatabase
} from '../testing/integration-database'

import { CreateOutboxMessages1793235600000 } from './migrations/1793235600000-CreateOutboxMessages'
import { currentTransaction, runInTransaction } from './transaction-context'

import type { DataSource, Repository } from 'typeorm'

const row = (routingKey: string, id = crypto.randomUUID()) => ({
  id,
  routingKey,
  payload: { routingKey }
})

describeWithDatabase('transaction context (Postgres)', () => {
  let dataSource: DataSource
  let destroy: () => Promise<void>
  let repository: Repository<OutboxMessage>

  beforeAll(async () => {
    const database = await createIntegrationDatabase({
      entities: [OutboxMessage],
      migrations: [CreateOutboxMessages1793235600000]
    })
    dataSource = database.dataSource
    destroy = database.destroy
    // An injected repository: created once, outside any transaction.
    repository = dataSource.getRepository(OutboxMessage)
  })

  afterAll(() => destroy())
  beforeEach(() => repository.clear())

  it('routes an injected repository to the ambient transaction', async () => {
    await expect(
      runInTransaction(dataSource, async () => {
        await repository.insert(row('inside'))
        // Visible inside the transaction...
        expect(await repository.count()).toBe(1)
        throw new Error('rollback')
      })
    ).rejects.toThrow('rollback')

    // ...and gone after the rollback.
    expect(await repository.count()).toBe(0)
  })

  it('commits what the injected repository wrote', async () => {
    await runInTransaction(dataSource, () => repository.insert(row('kept')))

    expect(await repository.findOneBy({ routingKey: 'kept' })).not.toBeNull()
  })

  it('joins a nested dataSource.transaction, rolled back with the outer one', async () => {
    await expect(
      runInTransaction(dataSource, async () => {
        await dataSource.transaction((manager) =>
          manager.getRepository(OutboxMessage).insert(row('nested'))
        )
        throw new Error('outer failed')
      })
    ).rejects.toThrow('outer failed')

    expect(await repository.count()).toBe(0)
  })

  it('rolls back only the savepoint of a nested transaction whose error is caught', async () => {
    const id = crypto.randomUUID()

    await runInTransaction(dataSource, async () => {
      await repository.insert(row('first', id))
      // The duplicate primary key aborts only the savepoint.
      await dataSource
        .transaction((manager) =>
          manager.getRepository(OutboxMessage).insert(row('duplicate', id))
        )
        .catch(() => undefined)
      await repository.insert(row('after'))
    })

    expect(
      (await repository.find({ order: { routingKey: 'ASC' } })).map(
        (message) => message.routingKey
      )
    ).toEqual(['after', 'first'])
  })

  it('runs after-commit hooks once the rows are visible to other connections', async () => {
    let seenByHook: number | undefined

    await runInTransaction(dataSource, async () => {
      await repository.insert(row('hooked'))
      currentTransaction()?.afterCommit(async () => {
        // Outside the transaction now: a pooled connection of its own.
        expect(currentTransaction()).toBeUndefined()
        seenByHook = await repository.count()
      })
    })

    expect(seenByHook).toBe(1)
  })
})

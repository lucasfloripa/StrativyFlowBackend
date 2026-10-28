import { Logger } from '@nestjs/common'
import { EntityManager, Repository } from 'typeorm'

import {
  currentTransaction,
  installTransactionalRepositories,
  runInTransaction
} from './transaction-context'

import type { DataSource, QueryRunner } from 'typeorm'

class Thing {
  id!: string
}

/** A data source whose `transaction` hands out a queryRunner-bound manager. */
const createDataSource = () => {
  const queries: string[] = []
  const dataSource = {} as DataSource & { manager: EntityManager }
  const baseManager = new EntityManager(dataSource)
  const queryRunner = {
    isReleased: false,
    startTransaction: jest.fn(() => {
      queries.push('BEGIN/SAVEPOINT')
      return Promise.resolve()
    }),
    commitTransaction: jest.fn(() => {
      queries.push('COMMIT/RELEASE')
      return Promise.resolve()
    }),
    rollbackTransaction: jest.fn(() => {
      queries.push('ROLLBACK')
      return Promise.resolve()
    }),
    release: jest.fn().mockResolvedValue(undefined)
  } as unknown as QueryRunner
  const transactionManager = new EntityManager(dataSource, queryRunner)
  ;(queryRunner as { manager: EntityManager }).manager = transactionManager

  Object.assign(dataSource, {
    manager: baseManager,
    createQueryRunner: jest.fn(() => queryRunner),
    transaction: (work: (manager: EntityManager) => Promise<unknown>) =>
      baseManager.transaction(work)
  })

  return { dataSource, baseManager, transactionManager, queries }
}

describe('transaction context', () => {
  beforeAll(() => installTransactionalRepositories())
  afterEach(() => jest.restoreAllMocks())

  describe('Repository#manager', () => {
    it('uses its own manager outside a transaction', () => {
      const { baseManager } = createDataSource()
      const repository = new Repository(Thing, baseManager)

      expect(repository.manager).toBe(baseManager)
      expect(currentTransaction()).toBeUndefined()
    })

    it('uses the transaction manager inside runInTransaction', async () => {
      const { dataSource, baseManager, transactionManager } = createDataSource()
      const repository = new Repository(Thing, baseManager)

      const seen = await runInTransaction(dataSource, () =>
        Promise.resolve(repository.manager)
      )

      expect(seen).toBe(transactionManager)
      expect(repository.manager).toBe(baseManager)
    })

    it('ignores the transaction of another data source', async () => {
      const first = createDataSource()
      const second = createDataSource()
      const repository = new Repository(Thing, second.baseManager)

      const seen = await runInTransaction(first.dataSource, () =>
        Promise.resolve(repository.manager)
      )

      expect(seen).toBe(second.baseManager)
    })
  })

  describe('nested transactions', () => {
    it('joins the ambient transaction as a savepoint', async () => {
      const { dataSource, transactionManager, queries } = createDataSource()

      const inner = await runInTransaction(dataSource, () =>
        dataSource.transaction((manager) => Promise.resolve(manager))
      )

      expect(inner).toBe(transactionManager)
      expect(queries).toEqual([
        'BEGIN/SAVEPOINT',
        'BEGIN/SAVEPOINT',
        'COMMIT/RELEASE',
        'COMMIT/RELEASE'
      ])
      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1)
    })

    it('rolls back only the savepoint when the inner work fails and is caught', async () => {
      const { dataSource, queries } = createDataSource()

      await runInTransaction(dataSource, async () => {
        await dataSource
          .transaction(() => Promise.reject(new Error('unique violation')))
          .catch(() => undefined)
      })

      expect(queries).toEqual([
        'BEGIN/SAVEPOINT',
        'BEGIN/SAVEPOINT',
        'ROLLBACK',
        'COMMIT/RELEASE'
      ])
    })

    it('runs a nested runInTransaction in the same transaction', async () => {
      const { dataSource, transactionManager, queries } = createDataSource()

      const inner = await runInTransaction(dataSource, () =>
        runInTransaction(dataSource, (manager) => Promise.resolve(manager))
      )

      expect(inner).toBe(transactionManager)
      expect(queries).toEqual(['BEGIN/SAVEPOINT', 'COMMIT/RELEASE'])
    })
  })

  describe('runInTransaction', () => {
    it('runs after-commit hooks only after COMMIT', async () => {
      const { dataSource, queries } = createDataSource()

      await runInTransaction(dataSource, () => {
        currentTransaction()?.afterCommit(() => {
          queries.push('hook')
        })
        return Promise.resolve()
      })

      expect(queries).toEqual(['BEGIN/SAVEPOINT', 'COMMIT/RELEASE', 'hook'])
    })

    it('skips after-commit hooks and rethrows when the work fails', async () => {
      const { dataSource, queries } = createDataSource()
      const hook = jest.fn()

      await expect(
        runInTransaction(dataSource, () => {
          currentTransaction()?.afterCommit(hook)
          return Promise.reject(new Error('boom'))
        })
      ).rejects.toThrow('boom')

      expect(hook).not.toHaveBeenCalled()
      expect(queries).toEqual(['BEGIN/SAVEPOINT', 'ROLLBACK'])
    })

    it('waits for tracked work before committing', async () => {
      const { dataSource, queries } = createDataSource()

      await runInTransaction(dataSource, () => {
        currentTransaction()?.track(
          new Promise<void>((resolve) =>
            setImmediate(() => {
              queries.push('tracked write')
              resolve()
            })
          )
        )
        return Promise.resolve()
      })

      expect(queries).toEqual([
        'BEGIN/SAVEPOINT',
        'tracked write',
        'COMMIT/RELEASE'
      ])
    })

    it('rolls back when tracked work fails', async () => {
      const { dataSource, queries } = createDataSource()

      await expect(
        runInTransaction(dataSource, () => {
          currentTransaction()?.track(
            Promise.reject(new Error('insert failed'))
          )
          return Promise.resolve()
        })
      ).rejects.toThrow('insert failed')

      expect(queries).toEqual(['BEGIN/SAVEPOINT', 'ROLLBACK'])
    })

    it('logs a failing after-commit hook and keeps the result', async () => {
      const { dataSource } = createDataSource()
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      await expect(
        runInTransaction(dataSource, () => {
          currentTransaction()?.afterCommit(() => {
            throw new Error('broker down')
          })
          return Promise.resolve('done')
        })
      ).resolves.toBe('done')

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'After-commit hook failed. error=broker down'
      )
    })
  })
})

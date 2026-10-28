import { AsyncLocalStorage } from 'async_hooks'

import { Logger } from '@nestjs/common'
import { EntityManager, Repository } from 'typeorm'

import type { DataSource } from 'typeorm'

/**
 * Ambient transaction for code that was written against injected
 * repositories. Inside `runInTransaction`, every TypeORM `Repository` of the
 * same data source runs its queries on the transaction's connection, and a
 * nested `dataSource.transaction(...)` joins it as a SAVEPOINT instead of
 * opening a second connection.
 */
export type TransactionContext = {
  manager: EntityManager
  /** Runs after COMMIT, in order; failures are logged, never thrown. */
  afterCommit(hook: () => Promise<void> | void): void
  /** Work started without `await` that must finish before COMMIT. */
  track(work: Promise<unknown>): void
}

type TransactionStore = TransactionContext & {
  hooks: Array<() => Promise<void> | void>
  pending: Set<Promise<unknown>>
}

const storage = new AsyncLocalStorage<TransactionStore>()
const logger = new Logger('TransactionContext')

export function currentTransaction(): TransactionContext | undefined {
  return storage.getStore()
}

/**
 * Runs `work` in a transaction. Already inside one for the same data
 * source? `work` joins it (no SAVEPOINT; use `manager.transaction` for that).
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>
): Promise<T> {
  const active = storage.getStore()
  if (active && active.manager.connection === dataSource) {
    return work(active.manager)
  }

  const hooks: Array<() => Promise<void> | void> = []
  const result = await dataSource.transaction((manager) => {
    const pending = new Set<Promise<unknown>>()
    const failures: unknown[] = []
    const store: TransactionStore = {
      manager,
      hooks,
      pending,
      afterCommit: (hook) => {
        hooks.push(hook)
      },
      track: (task) => {
        pending.add(task)
        void task.then(
          () => pending.delete(task),
          (error: unknown) => {
            pending.delete(task)
            failures.push(error)
          }
        )
      }
    }

    return storage.run(store, async () => {
      const value = await work(manager)
      while (pending.size > 0) {
        await Promise.allSettled([...pending])
      }
      if (failures.length > 0) {
        throw failures[0]
      }
      return value
    })
  })

  for (const hook of hooks) {
    try {
      await hook()
    } catch (error) {
      logger.error(
        `After-commit hook failed. error=${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return result
}

const BASE_MANAGER = Symbol('baseManager')
let installed = false

type RoutedRepository = { [BASE_MANAGER]?: EntityManager }

/**
 * Patches `Repository#manager` and `EntityManager#transaction` once per
 * process so the ambient transaction applies. Outside `runInTransaction`
 * nothing changes.
 */
export function installTransactionalRepositories(): void {
  if (installed) {
    return
  }
  installed = true

  Object.defineProperty(Repository.prototype, 'manager', {
    configurable: true,
    get(this: RoutedRepository): EntityManager | undefined {
      const base = this[BASE_MANAGER]
      const store = storage.getStore()

      return base && store && store.manager.connection === base.connection
        ? store.manager
        : base
    },
    set(this: RoutedRepository, manager: EntityManager) {
      this[BASE_MANAGER] = manager
    }
  })

  const originalTransaction = EntityManager.prototype.transaction
  EntityManager.prototype.transaction = function transaction(
    this: EntityManager,
    ...args: unknown[]
  ) {
    const store = storage.getStore()
    const target =
      !this.queryRunner && store && store.manager.connection === this.connection
        ? store.manager
        : this

    const invoke = originalTransaction as (
      this: EntityManager,
      ...params: unknown[]
    ) => Promise<unknown>

    return invoke.apply(target, args) as Promise<unknown>
  } as typeof EntityManager.prototype.transaction
}

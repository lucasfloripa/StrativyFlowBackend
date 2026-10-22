import type { ObjectLiteral, Repository } from 'typeorm'

const REPOSITORY_METHODS = [
  'count',
  'create',
  'createQueryBuilder',
  'delete',
  'exists',
  'find',
  'findBy',
  'findOne',
  'findOneBy',
  'findOneOrFail',
  'remove',
  'save',
  'update',
  'upsert'
] as const

export type RepositoryMethod = (typeof REPOSITORY_METHODS)[number]

export type MockRepository<T extends ObjectLiteral> = Repository<T> &
  Record<RepositoryMethod, jest.Mock>

/**
 * Builds a TypeORM repository double where every common method is a
 * `jest.fn()`. `create` returns its input so services that call
 * `repo.create(...)` before `repo.save(...)` keep working without setup.
 */
export function createMockRepository<
  T extends ObjectLiteral
>(): MockRepository<T> {
  const repository: Partial<Record<RepositoryMethod, jest.Mock>> = {}

  for (const method of REPOSITORY_METHODS) {
    repository[method] = jest.fn()
  }

  repository.create = jest.fn((entity: unknown) => entity)

  return repository as unknown as MockRepository<T>
}

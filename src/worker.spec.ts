import { NestFactory } from '@nestjs/core'

import './worker'

jest.mock('@nestjs/core', () => {
  const app = { enableShutdownHooks: jest.fn() }

  return {
    NestFactory: {
      createApplicationContext: jest.fn().mockResolvedValue(app)
    }
  }
})
jest.mock('./worker.module', () => ({ WorkerModule: class WorkerModule {} }))

describe('worker bootstrap', () => {
  it('enables shutdown hooks so SIGTERM drains jobs before exiting', async () => {
    const [created] = jest.mocked(NestFactory.createApplicationContext).mock
      .results
    const app = (await created.value) as unknown as {
      enableShutdownHooks: jest.Mock
    }
    await new Promise((resolve) => setImmediate(resolve))

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1)
  })
})

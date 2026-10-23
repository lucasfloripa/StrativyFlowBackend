import { NestFactory } from '@nestjs/core'

import './main'

jest.mock('@nestjs/core', () => {
  const app = {
    enableShutdownHooks: jest.fn(),
    set: jest.fn(),
    useGlobalPipes: jest.fn(),
    enableCors: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined)
  }

  return { NestFactory: { create: jest.fn().mockResolvedValue(app) } }
})
// main.ts reads these right after importing AppModule.
jest.mock('./app.module', () => {
  process.env.CORS_ORIGIN = 'https://app.example.com'
  process.env.PORT = '4000'
  process.env.TRUST_PROXY = '1'

  return { AppModule: class AppModule {} }
})

describe('API bootstrap', () => {
  it('enables shutdown hooks before listening', async () => {
    const [created] = jest.mocked(NestFactory.create).mock.results
    const app = (await created.value) as unknown as {
      enableShutdownHooks: jest.Mock
      set: jest.Mock
      listen: jest.Mock
    }
    await new Promise((resolve) => setImmediate(resolve))

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1)
    expect(app.enableShutdownHooks.mock.invocationCallOrder[0]).toBeLessThan(
      app.listen.mock.invocationCallOrder[0]
    )
  })

  it('trusts the number of proxies set in TRUST_PROXY for the client IP', async () => {
    const [created] = jest.mocked(NestFactory.create).mock.results
    const app = (await created.value) as unknown as { set: jest.Mock }
    await new Promise((resolve) => setImmediate(resolve))

    expect(app.set).toHaveBeenCalledWith('trust proxy', 1)
  })

  it('passes the CORS_ORIGIN list to CORS as a flat array', async () => {
    const [created] = jest.mocked(NestFactory.create).mock.results
    const app = (await created.value) as unknown as { enableCors: jest.Mock }
    await new Promise((resolve) => setImmediate(resolve))

    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ['https://app.example.com'] })
    )
  })
})

import { ConfigService } from '@nestjs/config'
import { WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'
import { Namespace, Socket } from 'socket.io'

import { CompanyAccessService } from '../auth/company-access.service'

import { RealtimeGateway } from './realtime.gateway'
import { RealtimeService } from './realtime.service'

describe('RealtimeGateway Company isolation', () => {
  const secret = 'realtime-test-secret'
  const leadId = '00000000-0000-4000-8000-000000000001'
  const setup = (
    userId = 'user-1',
    token = jwt.sign({ userId }, secret, { expiresIn: '1h' })
  ) => {
    const access = { assertResource: jest.fn().mockResolvedValue(undefined) }
    const config = {
      get: jest.fn((key: string) => (key === 'JWT_SECRET' ? secret : undefined))
    }
    const socket = {
      id: 'socket-1',
      handshake: { auth: { token } },
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      leave: jest.fn()
    }
    const gateway = new RealtimeGateway(
      { registerGateway: jest.fn() } as unknown as RealtimeService,
      config as unknown as ConfigService,
      access as unknown as CompanyAccessService
    )
    return { gateway, socket, client: socket as unknown as Socket, access }
  }
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it.each(['user-1', 'user-2'])(
    'allows authorized %s to subscribe to a lead of the same Company',
    async (userId) => {
      const { gateway, socket, client, access } = setup(userId)
      await expect(
        gateway.handleJoinLeadRoom(client, { leadId })
      ).resolves.toEqual({ room: `lead:${leadId}` })
      expect(access.assertResource).toHaveBeenCalledWith(userId, 'lead', leadId)
      expect(socket.join).toHaveBeenCalledWith(`lead:${leadId}`)
    }
  )
  it('rejects a user from another Company before joining the lead room', async () => {
    const { gateway, socket, client, access } = setup('user-3')
    access.assertResource.mockRejectedValue(new Error('Not found'))
    await expect(
      gateway.handleJoinLeadRoom(client, { leadId })
    ).rejects.toBeInstanceOf(WsException)
    expect(socket.join).not.toHaveBeenCalled()
  })
  it.each([
    '',
    'invalid',
    jwt.sign({ userId: 'user-1' }, secret, { expiresIn: -1 })
  ])('disconnects missing, invalid or expired token %s', async (token) => {
    const { gateway, socket, client, access } = setup('user-1', token)
    await gateway.handleConnection(client)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.join).not.toHaveBeenCalled()
    await expect(
      gateway.handleJoinLeadRoom(client, { leadId })
    ).rejects.toBeInstanceOf(WsException)
    expect(access.assertResource).not.toHaveBeenCalled()
  })
  it('joins only the authenticated user personal room and disconnects on token expiry', async () => {
    const { gateway, socket, client } = setup()
    await gateway.handleConnection(client)
    expect(socket.join).toHaveBeenCalledWith('user:user-1')
    jest.advanceTimersByTime(60 * 60 * 1000)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })
  it('cleans the session expiration timer on disconnect', async () => {
    const { gateway, socket, client } = setup()
    await gateway.handleConnection(client)
    gateway.handleDisconnect(client)
    jest.advanceTimersByTime(60 * 60 * 1000)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })
  it('rejects invalid lead identifiers without querying Company data', async () => {
    const { gateway, client, access } = setup()
    await expect(
      gateway.handleJoinLeadRoom(client, { leadId: 'invalid' })
    ).rejects.toBeInstanceOf(WsException)
    expect(access.assertResource).not.toHaveBeenCalled()
  })

  it('requires a valid JWT in the Socket.IO handshake middleware', () => {
    const { gateway, client } = setup()
    const middlewares: Array<
      (socket: Socket, next: (error?: Error) => void) => void
    > = []
    const server = {
      server: { engine: { opts: { cors: {} } } },
      use: jest.fn(
        (
          middleware: (socket: Socket, next: (error?: Error) => void) => void
        ) => {
          middlewares.push(middleware)
        }
      )
    }
    gateway.afterInit(server as unknown as Namespace)
    const accepted = jest.fn()
    middlewares[0](client, accepted)
    expect(accepted).toHaveBeenCalledWith()

    const rejected = jest.fn()
    const invalid = setup('user-1', 'invalid')
    middlewares[0](invalid.client, rejected)
    expect(rejected).toHaveBeenCalledWith(expect.any(Error))
  })
})

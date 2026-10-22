import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WsException,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { isUUID } from 'class-validator'
import jwt from 'jsonwebtoken'
import { Namespace, Server, Socket } from 'socket.io'

import { CompanyAccessService } from '../auth/company-access.service'

import { JoinLeadRoomDto } from './dto/join-lead-room.dto'
import { RealtimeService } from './realtime.service'

@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: true,
    credentials: true
  }
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Namespace

  private readonly logger = new Logger(RealtimeGateway.name)
  private readonly expirationTimers = new WeakMap<
    Socket,
    ReturnType<typeof setTimeout>
  >()

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly configService: ConfigService,
    private readonly access: CompanyAccessService
  ) {
    this.realtimeService.registerGateway(this)
  }

  afterInit(server: Namespace | Server): void {
    server.use((client, next) => {
      try {
        this.authenticate(client)
        next()
      } catch {
        next(new Error('Unauthorized'))
      }
    })
    const rootServer = this.getRootServer(server)

    if (!rootServer) {
      this.logger.warn(
        'Realtime gateway initialization skipped CORS patch because root Socket.IO server was not available'
      )
      return
    }

    rootServer.engine.opts.cors = {
      ...rootServer.engine.opts.cors,
      origin: (origin, callback) => {
        if (this.isAllowedOrigin(origin)) {
          callback(null, true)
          return
        }

        this.logger.warn(
          `Realtime socket connection blocked by CORS. origin=${origin ?? 'unknown'} allowedOrigins=${this.getAllowedOrigins().join(',') || 'none'}`
        )

        callback(new Error('Realtime CORS origin not allowed'))
      },
      credentials: true
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const identity = this.authenticate(client)
      await client.join(this.getUserRoom(identity.userId))
      if (identity.expiresAt !== undefined) {
        const timer = setTimeout(
          () => client.disconnect(true),
          identity.expiresAt * 1000 - Date.now()
        )
        this.expirationTimers.set(client, timer)
      }
    } catch {
      client.disconnect(true)
      return
    }
    this.logger.log(
      `WebSocket client connected. clientId=${client.id} timestamp=${new Date().toISOString()}`
    )
  }

  handleDisconnect(client: Socket): void {
    const timer = this.expirationTimers.get(client)
    if (timer) clearTimeout(timer)
    this.expirationTimers.delete(client)
    this.logger.log(
      `WebSocket client disconnected. clientId=${client.id} timestamp=${new Date().toISOString()}`
    )
  }

  @SubscribeMessage('joinLeadRoom')
  async handleJoinLeadRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinLeadRoomDto
  ): Promise<{ room: string }> {
    const leadId = payload?.leadId?.trim()

    if (!leadId || !isUUID(leadId)) {
      throw new WsException('Invalid leadId')
    }

    try {
      const identity = this.authenticate(client)
      await this.access.assertResource(identity.userId, 'lead', leadId)
    } catch {
      throw new WsException('Access denied')
    }

    const room = this.getLeadRoom(leadId)
    await client.join(room)

    this.logger.log(
      `WebSocket client joined lead room. clientId=${client.id} room=${room} timestamp=${new Date().toISOString()}`
    )

    return { room }
  }

  @SubscribeMessage('leaveLeadRoom')
  async handleLeaveLeadRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinLeadRoomDto
  ): Promise<{ room: string }> {
    const leadId = payload?.leadId?.trim()

    if (!leadId) {
      this.logger.warn(
        `leaveLeadRoom ignored due to missing leadId. clientId=${client.id} timestamp=${new Date().toISOString()}`
      )
      return { room: '' }
    }

    const room = this.getLeadRoom(leadId)
    await client.leave(room)

    this.logger.log(
      `WebSocket client left lead room. clientId=${client.id} room=${room} timestamp=${new Date().toISOString()}`
    )

    return { room }
  }

  emitToLead(leadId: string, event: string, payload: unknown): void {
    this.server.to(this.getLeadRoom(leadId)).emit(event, payload)
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(this.getUserRoom(userId)).emit(event, payload)
  }

  emitBroadcast(event: string, payload: unknown): void {
    this.server.emit(event, payload)
  }

  private getAllowedOrigins(): string[] {
    return (this.configService.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  }

  private authenticate(client: Socket): { userId: string; expiresAt?: number } {
    const auth = client.handshake.auth as { token?: unknown }
    const token = auth?.token
    const secret = this.configService.get<string>('JWT_SECRET')
    if (typeof token !== 'string' || !token.trim() || !secret)
      throw new Error('Unauthorized')
    const payload = jwt.verify(token, secret)
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      !payload.userId.trim()
    ) {
      throw new Error('Unauthorized')
    }
    return { userId: payload.userId, expiresAt: payload.exp }
  }

  private isAllowedOrigin(origin?: string): boolean {
    if (!origin) {
      return true
    }

    const allowedOrigins = this.getAllowedOrigins()

    if (allowedOrigins.includes(origin)) {
      return true
    }

    const isDevelopment =
      this.configService.get<string>('NODE_ENV') !== 'production'

    if (isDevelopment) {
      return (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      )
    }

    return false
  }

  private getRootServer(server: Namespace | Server): Server | null {
    if ('engine' in server) {
      return server
    }

    return server.server ?? null
  }

  private getLeadRoom(leadId: string): string {
    return `lead:${leadId}`
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`
  }
}

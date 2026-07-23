import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { Namespace, Server, Socket } from 'socket.io'

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

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly configService: ConfigService
  ) {
    this.realtimeService.registerGateway(this)
  }

  afterInit(server: Namespace | Server): void {
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

  handleConnection(client: Socket): void {
    this.logger.log(
      `WebSocket client connected. clientId=${client.id} timestamp=${new Date().toISOString()}`
    )
  }

  handleDisconnect(client: Socket): void {
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

    if (!leadId) {
      this.logger.warn(
        `joinLeadRoom ignored due to missing leadId. clientId=${client.id} timestamp=${new Date().toISOString()}`
      )
      return { room: '' }
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

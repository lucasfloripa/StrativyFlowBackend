import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

import { JoinLeadRoomDto } from './dto/join-lead-room.dto'
import { RealtimeService } from './realtime.service'

const realtimeGatewayLogger = new Logger('RealtimeGateway')

const realtimeCorsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

console.log('Realtime origins:', realtimeCorsOrigins)
console.log('allowed origins:', realtimeCorsOrigins.join(',') || 'none')

const isAllowedRealtimeOrigin = (origin?: string): boolean => {
  if (!origin) {
    return true
  }

  if (realtimeCorsOrigins.includes(origin)) {
    return true
  }

  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    return (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    )
  }

  return false
}

@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: (origin, callback) => {
      if (isAllowedRealtimeOrigin(origin)) {
        callback(null, true)
        return
      }

      realtimeGatewayLogger.warn(
        `Realtime socket connection blocked by CORS. origin=${origin ?? 'unknown'} allowedOrigins=${realtimeCorsOrigins.join(',') || 'none'}`
      )

      callback(new Error('Realtime CORS origin not allowed'))
    },
    credentials: true
  }
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(RealtimeGateway.name)

  constructor(private readonly realtimeService: RealtimeService) {
    this.realtimeService.registerGateway(this)
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

  private getLeadRoom(leadId: string): string {
    return `lead:${leadId}`
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`
  }
}

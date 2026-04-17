import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Request } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'

type TokenPayload = JwtPayload & {
  userId?: string
  role?: string
}

type AuthenticatedRequest = Request & {
  user?: {
    id: string
    userId: string
    role?: string
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token')
    }

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token')
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new UnauthorizedException('JWT secret is not configured')
    }

    try {
      const payload = jwt.verify(token, secret) as TokenPayload
      const userId = payload.userId

      if (!userId) {
        throw new UnauthorizedException('Invalid token payload')
      }

      request.user = {
        id: userId,
        userId,
        role: payload.role
      }

      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}

import { createHash, timingSafeEqual } from 'crypto'

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Request } from 'express'

const ADMIN_API_KEY_HEADER = 'x-admin-api-key'

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest()

/**
 * Protects platform administration routes (for example, onboarding a client
 * by creating their UserInformations). The caller must send the
 * `X-Admin-Api-Key` header matching `ADMIN_API_KEY`. When the variable is not
 * configured every request is refused.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name)

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const header = request.headers[ADMIN_API_KEY_HEADER]
    const providedKey = (Array.isArray(header) ? header[0] : header)?.trim()
    const expectedKey = this.configService.get<string>('ADMIN_API_KEY')?.trim()

    if (
      !expectedKey ||
      !providedKey ||
      !this.matches(providedKey, expectedKey)
    ) {
      this.logger.warn(
        `Rejected admin request without a valid admin API key. path=${request.path}`
      )
      throw new ForbiddenException('Admin access required')
    }

    return true
  }

  private matches(providedKey: string, expectedKey: string): boolean {
    return timingSafeEqual(digest(providedKey), digest(expectedKey))
  }
}

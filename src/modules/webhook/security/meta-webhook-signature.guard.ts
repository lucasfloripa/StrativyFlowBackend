import { createHmac, timingSafeEqual } from 'crypto'

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Provider,
  type RawBodyRequest,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Request } from 'express'

export const META_APP_SECRETS = Symbol('META_APP_SECRETS')

const SIGNATURE_HEADER = 'x-hub-signature-256'
const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i

/**
 * Parses `META_APP_SECRET`. It accepts one secret or a comma separated list,
 * so WhatsApp, Messenger and Instagram can come from the same Meta app or
 * from different apps.
 */
export function parseMetaAppSecrets(rawValue: string): string[] {
  const secrets = rawValue
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean)

  if (!secrets.length) {
    throw new Error('META_APP_SECRET must contain at least one app secret')
  }

  return secrets
}

export const metaAppSecretsProvider: Provider<string[]> = {
  provide: META_APP_SECRETS,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): string[] =>
    parseMetaAppSecrets(configService.getOrThrow<string>('META_APP_SECRET'))
}

/**
 * Rejects Meta webhook calls whose `X-Hub-Signature-256` header is not the
 * HMAC-SHA256 of the raw request body with one of the configured app secrets.
 * Requires the app to be created with `rawBody: true`.
 */
@Injectable()
export class MetaWebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaWebhookSignatureGuard.name)

  constructor(
    @Inject(META_APP_SECRETS) private readonly appSecrets: string[]
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>()
    const header = request.headers[SIGNATURE_HEADER]
    const signature = Array.isArray(header) ? header[0] : header

    if (!this.hasValidSignature(signature, request.rawBody)) {
      this.logger.warn(
        `Rejected Meta webhook with an invalid signature. path=${request.path}`
      )
      throw new UnauthorizedException('Invalid webhook signature')
    }

    return true
  }

  private hasValidSignature(
    signature: string | undefined,
    rawBody: Buffer | undefined
  ): boolean {
    if (!signature || !rawBody) {
      return false
    }

    const match = SIGNATURE_PATTERN.exec(signature.trim())

    if (!match) {
      return false
    }

    const receivedDigest = Buffer.from(match[1].toLowerCase(), 'hex')

    return this.appSecrets.some((secret) => {
      const expectedDigest = createHmac('sha256', secret)
        .update(rawBody)
        .digest()

      return (
        expectedDigest.length === receivedDigest.length &&
        timingSafeEqual(expectedDigest, receivedDigest)
      )
    })
  }
}

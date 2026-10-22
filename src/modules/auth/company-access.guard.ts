import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { isUUID } from 'class-validator'

import { CompanyAccessService, CompanyResource } from './company-access.service'

const RESOURCE_METADATA = 'company-resource'
export const CompanyResourceAccess = (resource: CompanyResource) =>
  SetMetadata(RESOURCE_METADATA, resource)

const references: Record<string, CompanyResource> = {
  leadId: 'lead',
  negotiationId: 'negotiation',
  attachmentId: 'attachment',
  followUpId: 'followUp',
  parentId: 'step',
  replyMessageId: 'message',
  costId: 'cost',
  paymentId: 'payment'
}

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: CompanyAccessService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string }
      params?: Record<string, unknown>
      query?: Record<string, unknown>
      body?: Record<string, unknown>
    }>()
    const userId = request.user?.id
    if (!userId) throw new UnauthorizedException()
    const resource = this.reflector.getAllAndOverride<
      CompanyResource | undefined
    >(RESOURCE_METADATA, [context.getHandler(), context.getClass()])
    for (const [source, values] of Object.entries({
      params: request.params,
      query: request.query,
      body: request.body
    })) {
      for (const [key, value] of Object.entries(values ?? {})) {
        const target =
          key === 'id' && source === 'params'
            ? resource
            : Object.hasOwn(references, key)
              ? references[key]
              : undefined
        if (!target || value === undefined || value === null) continue
        if (typeof value !== 'string' || !isUUID(value)) {
          throw new BadRequestException(`${key} must be a UUID`)
        }
        await this.access.assertResource(userId, target, value)
      }
    }
    await this.assertNestedReferences(userId, request.body)
    return true
  }

  private async assertNestedReferences(
    userId: string,
    body?: Record<string, unknown>
  ): Promise<void> {
    for (const key of ['steps', 'primaryStep', 'automationSteps']) {
      const value = body?.[key]
      const items: unknown[] = Array.isArray(value)
        ? value
        : value
          ? [value]
          : []
      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        for (const [reference, id] of Object.entries(item)) {
          const resource = Object.hasOwn(references, reference)
            ? references[reference]
            : undefined
          if (!resource || id === null || id === undefined) continue
          if (typeof id !== 'string' || !isUUID(id))
            throw new BadRequestException(`${reference} must be a UUID`)
          await this.access.assertResource(userId, resource, id)
        }
      }
    }
  }
}

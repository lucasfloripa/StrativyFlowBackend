import { Controller, Get, Req, UseGuards } from '@nestjs/common'

import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { NegotiationAttachmentListItemDto } from '../dto/negotiation-attachment-list-item.dto'
import { NegotiationAttachmentService } from '../services/negotiation-attachment.service'

import type { Request } from 'express'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('negotiation-attachments')
@UseGuards(JwtAuthGuard)
export class NegotiationAttachmentCollectionController {
  constructor(
    private readonly negotiationAttachmentService: NegotiationAttachmentService
  ) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest
  ): Promise<NegotiationAttachmentListItemDto[]> {
    return this.negotiationAttachmentService.listAttachmentsByUser(req.user.id)
  }
}

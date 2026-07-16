import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import type { Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'

import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { StorageUploadFile } from '../../storage/storage.service'

import { NegotiationAttachmentDownloadUrlDto } from '../dto/negotiation-attachment-download-url.dto'
import { NegotiationAttachmentResponseDto } from '../dto/negotiation-attachment-response.dto'
import { NegotiationAttachmentService } from '../services/negotiation-attachment.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('negotiations')
@UseGuards(JwtAuthGuard)
export class NegotiationAttachmentController {
  constructor(
    private readonly negotiationAttachmentService: NegotiationAttachmentService
  ) {}

  @Post(':negotiationId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('negotiationId') negotiationId: string,
    @UploadedFile() file: StorageUploadFile | undefined,
    @Req() req: AuthenticatedRequest
  ): Promise<NegotiationAttachmentResponseDto> {
    return this.negotiationAttachmentService.uploadAttachment(
      negotiationId,
      file,
      req.user.id
    )
  }

  @Get(':negotiationId/attachments')
  list(
    @Param('negotiationId') negotiationId: string
  ): Promise<NegotiationAttachmentResponseDto[]> {
    return this.negotiationAttachmentService.listAttachments(negotiationId)
  }

  @Get('attachments/:attachmentId/download')
  getDownloadUrl(
    @Param('attachmentId') attachmentId: string
  ): Promise<NegotiationAttachmentDownloadUrlDto> {
    return this.negotiationAttachmentService.getDownloadUrl(attachmentId)
  }

  @Delete('attachments/:attachmentId')
  remove(
    @Param('attachmentId') attachmentId: string
  ): Promise<{ success: true }> {
    return this.negotiationAttachmentService.deleteAttachment(attachmentId)
  }
}

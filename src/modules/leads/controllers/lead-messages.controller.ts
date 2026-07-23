import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'

import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { StorageUploadFile } from '../../storage/storage.service'

import { SendMediaLeadMessageDto } from '../dtos/send-media-lead-message.dto'
import { SendTextLeadMessageDto } from '../dtos/send-text-lead-message.dto'
import { SendMediaLeadMessageCommand } from '../services/commands/send-media-lead-message.command'
import { SendTextLeadMessageCommand } from '../services/commands/send-text-lead-message.command'
import { LeadMessageApplicationService } from '../services/lead-message-application.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadMessagesController {
  constructor(
    private readonly leadMessageApplicationService: LeadMessageApplicationService
  ) {}

  @Get(':leadId/messages')
  getMessages(
    @Param('leadId') leadId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.leadMessageApplicationService.getLeadMessages({
      userId: req.user.id,
      leadId
    })
  }

  @Post(':leadId/messages')
  sendMessage(
    @Param('leadId') leadId: string,
    @Body() body: SendTextLeadMessageDto,
    @Req() req: AuthenticatedRequest
  ) {
    const command: SendTextLeadMessageCommand = {
      userId: req.user.id,
      leadId,
      content: body.content
    }

    return this.leadMessageApplicationService.sendTextMessage(command)
  }

  @Post(':leadId/messages/media')
  @UseInterceptors(FileInterceptor('file'))
  sendMediaMessage(
    @Param('leadId') leadId: string,
    @UploadedFile() file: StorageUploadFile | undefined,
    @Body() body: SendMediaLeadMessageDto,
    @Req() req: AuthenticatedRequest
  ) {
    const command: SendMediaLeadMessageCommand = {
      userId: req.user.id,
      leadId,
      type: body.type,
      file,
      caption: body.caption,
      metadata: body.metadata
    }

    return this.leadMessageApplicationService.sendMediaMessage(command)
  }
}

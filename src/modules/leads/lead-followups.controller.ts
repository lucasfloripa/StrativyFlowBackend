import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { CreateLeadFollowUpDto } from './dtos/create-lead-followup.dto'
import { UpdateLeadFollowUpDto } from './dtos/update-lead-followup.dto'
import { LeadFollowUpsService } from './lead-followups.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class LeadFollowUpsController {
  constructor(private readonly leadFollowUpsService: LeadFollowUpsService) {}

  @Post('lead-followups')
  create(@Body() dto: CreateLeadFollowUpDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadFollowUpsService.create(userId, dto)
  }

  @Get('leads/:leadId/followups')
  listByLead(
    @Param('leadId') leadId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadFollowUpsService.listByLead(userId, leadId)
  }

  @Patch('lead-followups/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadFollowUpDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadFollowUpsService.update(userId, id, dto)
  }

  @Patch('lead-followups/:id/complete')
  complete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadFollowUpsService.complete(userId, id)
  }

  @Delete('lead-followups/:id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadFollowUpsService.remove(userId, id)
  }
}

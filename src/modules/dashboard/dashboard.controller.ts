import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { DashboardService } from './dashboard.service'
import {
  DashboardConversationFilter,
  DashboardConversationsQueryDto
} from './dto/dashboard-conversations-query.dto'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/summary')
  getDashboardSummary(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id

    return this.dashboardService.getSummary(userId)
  }

  @Get('dashboard/conversations')
  getDashboardConversations(
    @Req() req: AuthenticatedRequest,
    @Query() query: DashboardConversationsQueryDto
  ) {
    const userId = req.user.id

    return this.dashboardService.getConversations(
      userId,
      query.filter ?? DashboardConversationFilter.ALL
    )
  }
}

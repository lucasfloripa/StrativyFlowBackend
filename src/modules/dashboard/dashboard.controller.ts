import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { DashboardService } from './dashboard.service'

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
}

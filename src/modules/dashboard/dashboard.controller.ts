import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
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
  getDashboardSummary(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const userId = req.user.id

    return this.dashboardService.getSummary(userId, startDate, endDate)
  }

  @Get('dashboard/income')
  getDashboardIncome(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const userId = req.user.id

    return this.dashboardService.getIncome(userId, startDate, endDate)
  }
}

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { FinanceiroTopKpisQueryDto } from './dto/financeiro-top-kpis-query.dto'
import { FinanceiroService } from './financeiro.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('financeiro')
@UseGuards(JwtAuthGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('kpis-topo')
  async getTopKpis(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getTopKpis(req.user.id, query)
  }

  @Get('kpis-distribuicao')
  async getDistributionKpis(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getDistributionKpis(req.user.id, query)
  }
}

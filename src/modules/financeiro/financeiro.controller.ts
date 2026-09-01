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

  @Get('negocios/resumo')
  async getBusinessSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getBusinessSummary(req.user.id, query)
  }

  @Get('negocios/receita')
  async getRevenue(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getRevenue(req.user.id, query)
  }

  @Get('negocios/pagamentos')
  async getPayments(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getPayments(req.user.id, query)
  }

  @Get('custos-templates')
  async getTemplateCosts(
    @Req() req: AuthenticatedRequest,
    @Query() query: FinanceiroTopKpisQueryDto
  ) {
    return await this.financeiroService.getTemplateCosts(req.user.id, query)
  }
}

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

import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { CreateNegotiationFinancialDto } from '../dto/create-negotiation-financial.dto'
import { UpdateNegotiationFinancialDto } from '../dto/update-negotiation-financial.dto'
import { NegotiationFinancialService } from '../services/negotiation-financial.service'

import type { Request } from 'express'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('negotiations/:negotiationId/financial')
@UseGuards(JwtAuthGuard)
export class NegotiationFinancialController {
  constructor(private readonly financialService: NegotiationFinancialService) {}

  @Get()
  findOne(
    @Param('negotiationId') negotiationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.financialService.findOne(request.user.id, negotiationId)
  }

  @Post()
  create(
    @Param('negotiationId') negotiationId: string,
    @Body() dto: CreateNegotiationFinancialDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.financialService.create(request.user.id, negotiationId, dto)
  }

  @Patch()
  update(
    @Param('negotiationId') negotiationId: string,
    @Body() dto: UpdateNegotiationFinancialDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.financialService.update(request.user.id, negotiationId, dto)
  }

  @Delete()
  remove(
    @Param('negotiationId') negotiationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.financialService.remove(request.user.id, negotiationId)
  }
}

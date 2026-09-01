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
import { CreateNegotiationCostDto } from '../dto/create-negotiation-cost.dto'
import { UpdateNegotiationCostDto } from '../dto/update-negotiation-cost.dto'
import { NegotiationCostService } from '../services/negotiation-cost.service'

import type { Request } from 'express'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('negotiations/:negotiationId/financial/costs')
@UseGuards(JwtAuthGuard)
export class NegotiationCostController {
  constructor(private readonly costService: NegotiationCostService) {}

  @Get()
  findAll(
    @Param('negotiationId') negotiationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costService.findAll(request.user.id, negotiationId)
  }

  @Post()
  create(
    @Param('negotiationId') negotiationId: string,
    @Body() dto: CreateNegotiationCostDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costService.create(request.user.id, negotiationId, dto)
  }

  @Patch(':costId')
  update(
    @Param('negotiationId') negotiationId: string,
    @Param('costId') costId: string,
    @Body() dto: UpdateNegotiationCostDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costService.update(request.user.id, negotiationId, costId, dto)
  }

  @Delete(':costId')
  remove(
    @Param('negotiationId') negotiationId: string,
    @Param('costId') costId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.costService.remove(request.user.id, negotiationId, costId)
  }
}

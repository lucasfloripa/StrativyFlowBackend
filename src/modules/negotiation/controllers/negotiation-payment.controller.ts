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
import { CreateNegotiationPaymentInstallmentsDto } from '../dto/create-negotiation-payment-installments.dto'
import { CreateNegotiationPaymentDto } from '../dto/create-negotiation-payment.dto'
import { UpdateNegotiationPaymentDto } from '../dto/update-negotiation-payment.dto'
import { NegotiationPaymentService } from '../services/negotiation-payment.service'

import type { Request } from 'express'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('negotiations/:negotiationId/financial/payments')
@UseGuards(JwtAuthGuard)
export class NegotiationPaymentController {
  constructor(private readonly paymentService: NegotiationPaymentService) {}

  @Get()
  findAll(
    @Param('negotiationId') negotiationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.paymentService.findAll(request.user.id, negotiationId)
  }

  @Post()
  create(
    @Param('negotiationId') negotiationId: string,
    @Body() dto: CreateNegotiationPaymentDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.paymentService.create(request.user.id, negotiationId, dto)
  }

  @Post('installments')
  createInstallments(
    @Param('negotiationId') negotiationId: string,
    @Body() dto: CreateNegotiationPaymentInstallmentsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.paymentService.createInstallments(
      request.user.id,
      negotiationId,
      dto
    )
  }

  @Patch(':paymentId')
  update(
    @Param('negotiationId') negotiationId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateNegotiationPaymentDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.paymentService.update(
      request.user.id,
      negotiationId,
      paymentId,
      dto
    )
  }

  @Delete(':paymentId')
  remove(
    @Param('negotiationId') negotiationId: string,
    @Param('paymentId') paymentId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.paymentService.remove(request.user.id, negotiationId, paymentId)
  }
}

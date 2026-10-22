import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'

import {
  CompanyAccessGuard,
  CompanyResourceAccess
} from '../auth/company-access.guard'
import { CompanyAccessService } from '../auth/company-access.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { CreateNegotiationDto } from './dto/create-negotiation.dto'
import { UpdateNegotiationDto } from './dto/update-negotiation.dto'
import { NegotiationService } from './negotiation.service'

@Controller('negotiations')
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@CompanyResourceAccess('negotiation')
export class NegotiationController {
  constructor(
    private readonly negotiationService: NegotiationService,
    private readonly access: CompanyAccessService
  ) {}

  @Post()
  async create(@Body() dto: CreateNegotiationDto) {
    return await this.negotiationService.create(dto)
  }

  @Get()
  async findAll(
    @Req() request: { user: { id: string } },
    @Query('leadId') leadId?: string
  ) {
    return await this.negotiationService.findAll(
      leadId,
      await this.access.companyIdsForUser(request.user.id)
    )
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.negotiationService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNegotiationDto) {
    return await this.negotiationService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.negotiationService.remove(id)
  }
}

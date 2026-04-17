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
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { ArchiveLeadStateDto } from './dtos/archive-lead-state.dto'
import { CreateLeadDto } from './dtos/create-lead.dto'
import { MoveLeadDto } from './dtos/move-lead.dto'
import { UpdateLeadDto } from './dtos/update-lead.dto'
import { LeadsService } from './leads.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(
    @Body() createLeadDto: CreateLeadDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.create(userId, createLeadDto)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadsService.findOne(userId, id)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.update(userId, id, dto)
  }

  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveLeadDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.moveLead(userId, id, dto)
  }

  @Patch(':id/archive')
  archive(
    @Param('id') id: string,
    @Body() body: ArchiveLeadStateDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.archive(userId, id, body.state)
  }

  @Patch(':id/favorite')
  favorite(
    @Param('id') id: string,
    @Body() body: { isFavorite: boolean },
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.toggleFavorite(userId, id, body.isFavorite)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadsService.remove(userId, id)
  }
}

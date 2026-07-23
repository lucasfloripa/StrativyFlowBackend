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
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { ArchiveLeadStateDto } from './dtos/archive-lead-state.dto'
import { CreateLeadDto } from './dtos/create-lead.dto'
import { UpdateLeadDto } from './dtos/update-lead.dto'
import { UpdateRuntimeModeDto } from './dtos/update-runtime-mode.dto'
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

  @Post('rabbit/publish-test')
  publishRabbitTest(
    @Body() body: { routingKey?: string; payload?: unknown },
    @Req() req: AuthenticatedRequest
  ): Promise<{ success: boolean; routingKey: string }> {
    const userId = req.user.id

    return this.leadsService.publishRabbitTestMessage(userId, body)
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadsService.listByUser(userId)
  }

  @Post()
  create(
    @Body() createLeadDto: CreateLeadDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.create(userId, createLeadDto)
  }

  @Get('search')
  search(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    const userId = req.user.id

    return this.leadsService.searchByUser(userId, query)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadsService.findOne(userId, id)
  }

  @Get(':id/followups')
  getFollowUps(
    @Param('id') id: string,
    @Query() query: Record<string, string | string[] | undefined>,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.getLeadFollowUps(userId, id, query)
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

  @Patch(':id/runtime-mode')
  updateRuntimeMode(
    @Param('id') id: string,
    @Body() body: UpdateRuntimeModeDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.id
    return this.leadsService.updateRuntimeMode(userId, id, body.runtimeMode)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    return this.leadsService.remove(userId, id)
  }
}

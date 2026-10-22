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

import {
  CompanyAccessGuard,
  CompanyResourceAccess
} from '../../auth/company-access.guard'
import { CompanyAccessService } from '../../auth/company-access.service'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { CreateFollowUpDto } from '../dto/create-followup.dto'
import { UpdateFollowUpDto } from '../dto/update-followup.dto'
import { FollowUpService } from '../services/followup.service'

@Controller('followups')
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@CompanyResourceAccess('followUp')
export class FollowUpController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly access: CompanyAccessService
  ) {}

  @Post()
  async create(@Body() dto: CreateFollowUpDto) {
    return await this.followUpService.create(dto)
  }

  @Get()
  async findAll(@Req() request: { user: { id: string } }) {
    return await this.followUpService.findAll(
      await this.access.companyIdsForUser(request.user.id)
    )
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.followUpService.findOne(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto) {
    return await this.followUpService.update(id, dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.followUpService.remove(id)
  }
}

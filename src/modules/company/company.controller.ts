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

import { CompanyService } from './company.service'
import { AddCompanyMembersDto } from './dto/add-company-members.dto'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  create(
    @Body() createCompanyDto: CreateCompanyDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.companyService.create(request.user.id, createCompanyDto)
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.companyService.findAll(request.user.id)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.companyService.findOne(request.user.id, id)
  }

  @Get(':id/members')
  findMembers(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.companyService.findMembers(request.user.id, id)
  }

  @Post(':id/members')
  addMembers(
    @Param('id') id: string,
    @Body() dto: AddCompanyMembersDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.companyService.addMembers(request.user.id, id, dto)
  }

  @Delete(':id/members/:userInformationsId')
  removeMember(
    @Param('id') id: string,
    @Param('userInformationsId') userInformationsId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.companyService.removeMember(
      request.user.id,
      id,
      userInformationsId
    )
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.companyService.update(request.user.id, id, updateCompanyDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.companyService.remove(request.user.id, id)
  }
}

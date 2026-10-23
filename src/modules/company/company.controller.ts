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
import { CompanyResponseDto } from './dto/company-response.dto'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { toCompanyResponse } from './mappers/company-response.mapper'

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
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
    @Req() request: AuthenticatedRequest
  ): Promise<CompanyResponseDto> {
    return toCompanyResponse(
      await this.companyService.create(request.user.id, createCompanyDto)
    )
  }

  @Get()
  async findAll(
    @Req() request: AuthenticatedRequest
  ): Promise<CompanyResponseDto[]> {
    const companies = await this.companyService.findAll(request.user.id)

    return companies.map(toCompanyResponse)
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest
  ): Promise<CompanyResponseDto> {
    return toCompanyResponse(
      await this.companyService.findOne(request.user.id, id)
    )
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
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Req() request: AuthenticatedRequest
  ): Promise<CompanyResponseDto> {
    return toCompanyResponse(
      await this.companyService.update(request.user.id, id, updateCompanyDto)
    )
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest
  ): Promise<CompanyResponseDto> {
    return toCompanyResponse(
      await this.companyService.remove(request.user.id, id)
    )
  }
}

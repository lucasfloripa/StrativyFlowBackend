import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { Company } from './company.entity'
import { AddCompanyMembersDto } from './dto/add-company-members.dto'
import { CompanyMemberResponseDto } from './dto/company-member-response.dto'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { CompanyServiceContract } from './interfaces/company-service.interface'

@Injectable()
export class CompanyService implements CompanyServiceContract {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>
  ) {}

  async create(userId: string, dto: CreateCompanyDto): Promise<Company> {
    const userInformations = await this.findUnassignedUserInformations(userId)

    if (!userInformations.length) {
      throw new ConflictException(
        'User has no unassigned information mapping for a new Company'
      )
    }

    const company = await this.companyRepository.save(
      this.companyRepository.create({
        name: this.normalizeRequiredName(dto.name),
        companyPhoneNumber: dto.companyPhoneNumber ?? null,
        companyPhoneNumberId: dto.companyPhoneNumberId ?? null,
        whatsappToken: dto.whatsappToken ?? null,
        messengerPageId: dto.messengerPageId ?? null,
        messengerToken: dto.messengerToken ?? null,
        instagramAccountId: dto.instagramAccountId ?? null,
        instagramToken: dto.instagramToken ?? null
      })
    )
    userInformations[0].companyId = company.id
    await this.userInformationsRepository.save(userInformations[0])

    return company
  }

  async findAll(userId: string): Promise<Company[]> {
    const userInformations = await this.userInformationsRepository.find({
      where: { userId },
      relations: { company: true }
    })

    return [
      ...new Map(
        userInformations
          .map((userInformation) => userInformation.company)
          .filter((company): company is Company => Boolean(company))
          .map((company) => [company.id, company])
      ).values()
    ].sort(
      (first, second) => second.createdAt.getTime() - first.createdAt.getTime()
    )
  }

  async findOne(userId: string, id: string): Promise<Company> {
    return await this.findOwnedCompany(userId, id)
  }

  async findMembers(
    userId: string,
    companyId: string
  ): Promise<CompanyMemberResponseDto[]> {
    const company = await this.findOwnedCompany(userId, companyId)
    const members = await this.userInformationsRepository.find({
      where: { companyId: company.id },
      select: ['id', 'name', 'email', 'phoneNumber'],
      order: { createdAt: 'ASC' }
    })

    return members.map((member) => this.toMemberResponse(member))
  }

  async addMembers(
    userId: string,
    companyId: string,
    dto: AddCompanyMembersDto
  ): Promise<CompanyMemberResponseDto[]> {
    const company = await this.findOwnedCompany(userId, companyId)
    const userInformationsIds = [...new Set(dto.userInformationsIds)]

    if (!userInformationsIds.length) {
      throw new BadRequestException('At least one member ID is required')
    }

    const members = await this.userInformationsRepository.find({
      where: { id: In(userInformationsIds) }
    })

    if (members.length !== userInformationsIds.length) {
      throw new NotFoundException('One or more UserInformations not found')
    }

    if (
      members.some(
        (member) => member.companyId && member.companyId !== company.id
      )
    ) {
      throw new ConflictException(
        'A UserInformations mapping already belongs to another Company'
      )
    }

    const membersToLink = members.filter(
      (member) => member.companyId !== company.id
    )
    for (const member of membersToLink) {
      member.companyId = company.id
    }

    if (membersToLink.length) {
      await this.userInformationsRepository.save(membersToLink)
    }

    return members.map((member) => this.toMemberResponse(member))
  }

  async removeMember(
    userId: string,
    companyId: string,
    userInformationsId: string
  ): Promise<{ success: true }> {
    const company = await this.findOwnedCompany(userId, companyId)
    const member = await this.userInformationsRepository.findOne({
      where: { id: userInformationsId, companyId: company.id }
    })

    if (!member) {
      throw new NotFoundException('Company member not found')
    }

    const memberCount = await this.userInformationsRepository.count({
      where: { companyId: company.id }
    })
    if (memberCount <= 1) {
      throw new ConflictException('A Company must have at least one member')
    }

    member.companyId = null
    await this.userInformationsRepository.save(member)

    return { success: true }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCompanyDto
  ): Promise<Company> {
    const company = await this.findOwnedCompany(userId, id)

    if (dto.name !== undefined) {
      company.name = this.normalizeRequiredName(dto.name)
    }

    if (dto.companyPhoneNumber !== undefined) {
      company.companyPhoneNumber = this.normalizeOptionalValue(
        dto.companyPhoneNumber
      )
    }

    if (dto.companyPhoneNumberId !== undefined) {
      company.companyPhoneNumberId = this.normalizeOptionalValue(
        dto.companyPhoneNumberId
      )
    }

    if (dto.whatsappToken !== undefined) {
      company.whatsappToken = this.normalizeOptionalValue(dto.whatsappToken)
    }

    if (dto.messengerPageId !== undefined) {
      company.messengerPageId = this.normalizeOptionalValue(dto.messengerPageId)
    }

    if (dto.messengerToken !== undefined) {
      company.messengerToken = this.normalizeOptionalValue(dto.messengerToken)
    }

    if (dto.instagramAccountId !== undefined) {
      company.instagramAccountId = this.normalizeOptionalValue(
        dto.instagramAccountId
      )
    }

    if (dto.instagramToken !== undefined) {
      company.instagramToken = this.normalizeOptionalValue(dto.instagramToken)
    }

    return await this.companyRepository.save(company)
  }

  async remove(userId: string, id: string): Promise<Company> {
    const company = await this.findOwnedCompany(userId, id)
    return await this.companyRepository.remove(company)
  }

  private async findUnassignedUserInformations(
    userId: string
  ): Promise<UserInformations[]> {
    return await this.userInformationsRepository.find({
      where: { userId, companyId: IsNull() },
      order: { createdAt: 'ASC' }
    })
  }

  private async findOwnedCompany(userId: string, id: string): Promise<Company> {
    const userInformation = await this.userInformationsRepository.findOne({
      where: { userId, companyId: id },
      relations: { company: true }
    })

    if (!userInformation?.company) {
      throw new NotFoundException('Company not found')
    }

    return userInformation.company
  }

  private toMemberResponse(member: UserInformations): CompanyMemberResponseDto {
    return {
      id: member.id,
      name: member.name ?? null,
      email: member.email ?? null,
      phoneNumber: member.phoneNumber
    }
  }

  private normalizeRequiredName(name: string): string {
    const normalizedName = name.trim()

    if (!normalizedName) {
      throw new BadRequestException('name must not be empty')
    }

    return normalizedName
  }

  private normalizeOptionalValue(value?: string | null): string | null {
    return value?.trim() || null
  }
}

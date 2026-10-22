import { Company } from '../company.entity'
import { AddCompanyMembersDto } from '../dto/add-company-members.dto'
import { CompanyMemberResponseDto } from '../dto/company-member-response.dto'
import { CreateCompanyDto } from '../dto/create-company.dto'
import { UpdateCompanyDto } from '../dto/update-company.dto'

export interface CompanyServiceContract {
  create(userId: string, dto: CreateCompanyDto): Promise<Company>
  findAll(userId: string): Promise<Company[]>
  findOne(userId: string, id: string): Promise<Company>
  findMembers(
    userId: string,
    companyId: string
  ): Promise<CompanyMemberResponseDto[]>
  addMembers(
    userId: string,
    companyId: string,
    dto: AddCompanyMembersDto
  ): Promise<CompanyMemberResponseDto[]>
  removeMember(
    userId: string,
    companyId: string,
    userInformationsId: string
  ): Promise<{ success: true }>
  update(userId: string, id: string, dto: UpdateCompanyDto): Promise<Company>
  remove(userId: string, id: string): Promise<Company>
}

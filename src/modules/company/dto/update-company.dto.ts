import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  companyPhoneNumber?: string | null

  @IsOptional()
  @IsString()
  companyPhoneNumberId?: string | null

  @IsOptional()
  @IsString()
  whatsappToken?: string | null

  @IsOptional()
  @IsString()
  messengerPageId?: string | null

  @IsOptional()
  @IsString()
  messengerToken?: string | null

  @IsOptional()
  @IsString()
  instagramAccountId?: string | null

  @IsOptional()
  @IsString()
  instagramToken?: string | null
}

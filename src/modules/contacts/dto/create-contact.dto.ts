import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  phone!: string

  @IsOptional()
  @IsString()
  company?: string

  @IsOptional()
  @IsString()
  instagram?: string
}

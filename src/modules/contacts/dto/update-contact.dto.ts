import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string

  @IsOptional()
  @IsString()
  company?: string

  @IsOptional()
  @IsString()
  instagram?: string
}

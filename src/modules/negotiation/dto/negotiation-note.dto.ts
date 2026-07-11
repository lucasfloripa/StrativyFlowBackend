import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class NegotiationNoteDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsOptional()
  @IsDateString()
  createdAt?: string
}

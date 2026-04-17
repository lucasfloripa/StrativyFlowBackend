import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator'

export class ColumnOnEnterCreateFollowUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  value: string

  @IsOptional()
  @IsDateString()
  dueAt?: string
}

export class ColumnOnEnterAutomationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnOnEnterCreateFollowUpDto)
  createFollowUp?: ColumnOnEnterCreateFollowUpDto

  @IsOptional()
  @IsBoolean()
  favoriteLead?: boolean

  @IsOptional()
  @IsBoolean()
  markAllFollowUpsAsDone?: boolean

  @IsOptional()
  @IsBoolean()
  resetLastActivityAt?: boolean
}

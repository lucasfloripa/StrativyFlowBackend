import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'

import { ColumnOnEnterAutomationDto } from './column-on-enter-automation.dto'

export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string

  // se vier, insere nessa posição; se não vier, coloca no final
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnOnEnterAutomationDto)
  onEnter?: ColumnOnEnterAutomationDto
}

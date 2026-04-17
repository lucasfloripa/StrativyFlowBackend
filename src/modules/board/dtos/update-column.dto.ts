import { Type } from 'class-transformer'
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator'

import { ColumnOnEnterAutomationDto } from './column-on-enter-automation.dto'

export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnOnEnterAutomationDto)
  onEnter?: ColumnOnEnterAutomationDto | null
}

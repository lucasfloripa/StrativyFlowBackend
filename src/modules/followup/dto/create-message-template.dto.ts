import { Type } from 'class-transformer'
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsString,
  ValidateNested
} from 'class-validator'

import { MessageTemplateVariableDto } from './message-template-variable.dto'

export class CreateMessageTemplateDto {
  @IsUUID()
  userInformationsId!: string

  @IsString()
  @IsNotEmpty()
  metaTemplateName!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsString()
  metaTemplateId?: string | null

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @IsString()
  category?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageTemplateVariableDto)
  @ArrayUnique((variable: MessageTemplateVariableDto) => variable.key)
  variables!: MessageTemplateVariableDto[]
}
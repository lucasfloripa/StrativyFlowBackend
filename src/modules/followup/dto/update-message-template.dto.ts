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

export class UpdateMessageTemplateDto {
  @IsOptional()
  @IsUUID()
  userInformationsId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  metaTemplateName?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  description?: string

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageTemplateVariableDto)
  @ArrayUnique((variable: MessageTemplateVariableDto) => variable.key)
  variables?: MessageTemplateVariableDto[]
}

import { IsBoolean, IsNotEmpty, IsString } from 'class-validator'

export class MessageTemplateVariableDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  label!: string

  @IsBoolean()
  required!: boolean
}
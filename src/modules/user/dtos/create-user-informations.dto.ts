import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString
} from 'class-validator'

export class CreateUserInformationsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notificationWhatsAppNumbers?: string[]

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  notificationEmails?: string[]
}

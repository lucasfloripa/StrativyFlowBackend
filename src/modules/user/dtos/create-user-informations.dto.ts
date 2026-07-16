import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject
} from 'class-validator'

import type { NotificationPreferences } from '../../notification/types'

export class CreateUserInformationsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsEmail()
  @IsNotEmpty()
  email!: string

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

  @IsOptional()
  @IsObject()
  notificationPreferences?: NotificationPreferences
}

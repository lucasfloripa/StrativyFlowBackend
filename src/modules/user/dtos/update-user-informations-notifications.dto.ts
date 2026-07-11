import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator'

export class UpdateUserInformationsNotificationsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notificationWhatsAppNumbers?: string[]

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  notificationEmails?: string[]
}

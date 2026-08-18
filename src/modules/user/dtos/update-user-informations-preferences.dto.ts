import { IsObject, IsOptional, IsString } from 'class-validator'

import type { NotificationPreferences } from '../../notification/types'

export class UpdateUserInformationsPreferencesDto {
  @IsOptional()
  @IsObject()
  notificationPreferences?: NotificationPreferences

  @IsOptional()
  @IsString()
  messengerPageId?: string | null

  @IsOptional()
  @IsString()
  messengerToken?: string | null

  @IsOptional()
  @IsString()
  instagramAccountId?: string | null

  @IsOptional()
  @IsString()
  instagramToken?: string | null
}

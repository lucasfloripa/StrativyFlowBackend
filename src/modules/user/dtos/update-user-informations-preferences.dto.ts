import { IsOptional, IsObject } from 'class-validator'

import type { NotificationPreferences } from '../../notification/types'

export class UpdateUserInformationsPreferencesDto {
  @IsOptional()
  @IsObject()
  notificationPreferences?: NotificationPreferences
}

import { NotificationType } from '../enums'
import { NotificationChannel } from '../enums'

export type NotificationPreferences = Partial<
  Record<NotificationType, NotificationChannel[]>
>

import { NotificationType, NotificationChannel } from '../enums'

export type NotificationPreferences = Partial<
  Record<NotificationType, NotificationChannel[]>
>

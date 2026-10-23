import type { NotificationPreferences } from '../../notification/types'

/**
 * Public shape of a UserInformations record. It is an explicit allow-list:
 * channel tokens and channel ids stored on the entity are never returned.
 */
export type UserInformationsResponseDto = {
  id: string
  userId: string
  companyId: string | null
  companyName: string | null
  name: string | null
  email: string | null
  phoneNumber: string
  notificationWhatsAppNumbers: string[]
  notificationEmails: string[]
  notificationPreferences: NotificationPreferences
  messageShortcuts: Record<string, string> | null
  createdAt: Date
  updatedAt: Date
}

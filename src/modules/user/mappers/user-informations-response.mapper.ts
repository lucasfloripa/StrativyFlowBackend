import { UserInformationsResponseDto } from '../dtos/user-informations-response.dto'
import { UserInformations } from '../entities/user-informations.entity'

export function toUserInformationsResponse(
  userInformations: UserInformations
): UserInformationsResponseDto {
  return {
    id: userInformations.id,
    userId: userInformations.userId,
    companyId: userInformations.companyId ?? null,
    companyName: userInformations.company?.name ?? null,
    name: userInformations.name ?? null,
    email: userInformations.email ?? null,
    phoneNumber: userInformations.phoneNumber,
    notificationWhatsAppNumbers:
      userInformations.notificationWhatsAppNumbers ?? [],
    notificationEmails: userInformations.notificationEmails ?? [],
    notificationPreferences: userInformations.notificationPreferences ?? {},
    messageShortcuts: userInformations.messageShortcuts ?? null,
    createdAt: userInformations.createdAt,
    updatedAt: userInformations.updatedAt
  }
}

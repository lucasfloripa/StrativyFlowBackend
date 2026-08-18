import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { NotificationType, NotificationChannel } from '../notification/enums'

import { CreateUserInformationsDto } from './dtos/create-user-informations.dto'
import { UpdateUserInformationsNotificationsDto } from './dtos/update-user-informations-notifications.dto'
import { UpdateUserInformationsPreferencesDto } from './dtos/update-user-informations-preferences.dto'
import { UpdateUserInformationsShortcutsDto } from './dtos/update-user-informations-shortcuts.dto'
import { UserInformations } from './entities/user-informations.entity'

import type { NotificationPreferences } from '../notification/types'

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  [NotificationType.NEW_LEAD]: [NotificationChannel.APP],
  [NotificationType.MESSAGE_RECEIVED]: [NotificationChannel.APP],
  [NotificationType.FOLLOWUP_ONE_HOUR]: [NotificationChannel.APP]
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async createUserInformations(dto: CreateUserInformationsDto) {
    const userId = dto.userId.trim()
    const name = dto.name?.trim() || null
    const email = dto.email.trim().toLowerCase()
    const phoneNumber = dto.phoneNumber.trim()
    const messengerPageId = dto.messengerPageId?.trim() || null
    const messengerToken = dto.messengerToken?.trim() || null
    const instagramAccountId = dto.instagramAccountId?.trim() || null
    const instagramToken = dto.instagramToken?.trim() || null

    if (!userId || !email || !phoneNumber) {
      throw new BadRequestException(
        'userId, email and phoneNumber are required'
      )
    }

    const existingByPhone = await this.userInformationsRepo.findOne({
      where: { phoneNumber }
    })

    if (existingByPhone) {
      throw new ConflictException('phoneNumber is already mapped to a user')
    }

    const userInformations = this.userInformationsRepo.create({
      userId,
      name,
      email,
      phoneNumber,
      messengerPageId,
      messengerToken,
      instagramAccountId,
      instagramToken,
      notificationWhatsAppNumbers: dto.notificationWhatsAppNumbers ?? [],
      notificationEmails: dto.notificationEmails ?? [],
      notificationPreferences:
        dto.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES
    })

    return this.userInformationsRepo.save(userInformations)
  }

  async updateUserInformationsNotificationsByUserId(
    userId: string,
    dto: UpdateUserInformationsNotificationsDto
  ) {
    const normalizedUserId = userId.trim()

    if (!normalizedUserId) {
      throw new BadRequestException('userId is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId: normalizedUserId },
      order: { createdAt: 'ASC' }
    })

    if (!userInformations) {
      throw new NotFoundException('User informations not found')
    }

    if (dto.notificationWhatsAppNumbers) {
      userInformations.notificationWhatsAppNumbers =
        dto.notificationWhatsAppNumbers
          .map((number) => number.trim())
          .filter(Boolean)
    }

    if (dto.notificationEmails) {
      userInformations.notificationEmails = dto.notificationEmails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => Boolean(email))
    }

    return this.userInformationsRepo.save(userInformations)
  }

  async updateUserInformationsPreferencesByUserId(
    userId: string,
    dto: UpdateUserInformationsPreferencesDto
  ) {
    const normalizedUserId = userId.trim()

    if (!normalizedUserId) {
      throw new BadRequestException('userId is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId: normalizedUserId },
      order: { createdAt: 'ASC' }
    })

    if (!userInformations) {
      throw new NotFoundException('User informations not found')
    }

    if (dto.notificationPreferences) {
      userInformations.notificationPreferences = dto.notificationPreferences
    }

    if (dto.messengerPageId !== undefined) {
      userInformations.messengerPageId = dto.messengerPageId?.trim() || null
    }

    if (dto.messengerToken !== undefined) {
      userInformations.messengerToken = dto.messengerToken?.trim() || null
    }

    if (dto.instagramAccountId !== undefined) {
      userInformations.instagramAccountId =
        dto.instagramAccountId?.trim() || null
    }

    if (dto.instagramToken !== undefined) {
      userInformations.instagramToken = dto.instagramToken?.trim() || null
    }

    return this.userInformationsRepo.save(userInformations)
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.userInformationsRepo.findOne({
      where: { phoneNumber }
    })
  }

  async findByUserId(userId: string) {
    const normalizedUserId = userId.trim()

    if (!normalizedUserId) {
      return []
    }

    return this.userInformationsRepo.find({
      where: { userId: normalizedUserId },
      order: { createdAt: 'ASC' }
    })
  }

  async updateUserInformationsShortcutsByUserId(
    userId: string,
    dto: UpdateUserInformationsShortcutsDto
  ) {
    const normalizedUserId = userId.trim()

    if (!normalizedUserId) {
      throw new BadRequestException('userId is required')
    }

    const userInformations = await this.userInformationsRepo.findOne({
      where: { userId: normalizedUserId },
      order: { createdAt: 'ASC' }
    })

    if (!userInformations) {
      throw new NotFoundException('User informations not found')
    }

    if (dto.messageShortcuts !== undefined) {
      userInformations.messageShortcuts = dto.messageShortcuts ?? null
    }

    return this.userInformationsRepo.save(userInformations)
  }
}

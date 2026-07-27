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
    }

    if (dto.notificationEmails) {
      userInformations.notificationEmails = dto.notificationEmails
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
}

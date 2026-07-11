import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateUserInformationsDto } from './dtos/create-user-informations.dto'
import { UpdateUserInformationsNotificationsDto } from './dtos/update-user-informations-notifications.dto'
import { UserInformations } from './entities/user-informations.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserInformations)
    private readonly userInformationsRepo: Repository<UserInformations>
  ) {}

  async createUserInformations(dto: CreateUserInformationsDto) {
    const userId = dto.userId.trim()
    const name = dto.name?.trim() || null
    const phoneNumber = dto.phoneNumber.trim()

    if (!userId || !phoneNumber) {
      throw new BadRequestException('userId and phoneNumber are required')
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
      phoneNumber,
      notificationWhatsAppNumbers: dto.notificationWhatsAppNumbers ?? [],
      notificationEmails: dto.notificationEmails ?? []
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

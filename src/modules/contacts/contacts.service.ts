import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Not, QueryFailedError, Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { Contact } from './contact.entity'
import { CreateContactDto } from './dto/create-contact.dto'
import { UpdateContactDto } from './dto/update-contact.dto'

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(UserInformations)
    private readonly userInformationsRepository: Repository<UserInformations>
  ) {}

  async create(userId: string, dto: CreateContactDto): Promise<Contact> {
    const userInformations = await this.findUserInformations(userId)

    if (!userInformations.length) {
      throw new BadRequestException(
        'User has no information mapping configured'
      )
    }

    const name = this.normalizeRequiredValue(dto.name, 'name')
    const phone = this.normalizeRequiredValue(dto.phone, 'phone')
    const userInformationsIds = userInformations.map((item) => item.id)

    await this.assertPhoneIsAvailable(userInformationsIds, phone)

    const contact = this.contactRepository.create({
      userInformationsId: userInformations[0].id,
      name,
      phone,
      company: this.normalizeOptionalValue(dto.company),
      instagram: this.normalizeOptionalValue(dto.instagram)
    })

    return await this.saveContact(contact)
  }

  async findAll(userId: string): Promise<Contact[]> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      return []
    }

    return await this.contactRepository.find({
      where: { userInformationsId: In(userInformationsIds) },
      order: { createdAt: 'DESC' }
    })
  }

  async findOne(userId: string, id: string): Promise<Contact> {
    return await this.findOwnedContact(userId, id)
  }

  async findMany(userId: string, ids: string[]): Promise<Contact[]> {
    const userInformationsIds = await this.findUserInformationsIds(userId)

    if (!userInformationsIds.length) {
      throw new NotFoundException('Contact not found')
    }

    const contacts = await this.contactRepository.find({
      where: {
        id: In(ids),
        userInformationsId: In(userInformationsIds)
      }
    })

    if (contacts.length !== ids.length) {
      throw new NotFoundException('Contact not found')
    }

    const contactsById = new Map(
      contacts.map((contact) => [contact.id, contact])
    )
    return ids.map((id) => contactsById.get(id) as Contact)
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateContactDto
  ): Promise<Contact> {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    const contact = await this.findOwnedContactByMappings(
      userInformationsIds,
      id
    )

    if (dto.name !== undefined) {
      contact.name = this.normalizeRequiredValue(dto.name, 'name')
    }

    if (dto.phone !== undefined) {
      const phone = this.normalizeRequiredValue(dto.phone, 'phone')
      await this.assertPhoneIsAvailable(userInformationsIds, phone, contact.id)
      contact.phone = phone
    }

    if (dto.company !== undefined) {
      contact.company = this.normalizeOptionalValue(dto.company)
    }

    if (dto.instagram !== undefined) {
      contact.instagram = this.normalizeOptionalValue(dto.instagram)
    }

    return await this.saveContact(contact)
  }

  async remove(userId: string, id: string): Promise<Contact> {
    const contact = await this.findOwnedContact(userId, id)
    return await this.contactRepository.remove(contact)
  }

  private async findUserInformations(
    userId: string
  ): Promise<UserInformations[]> {
    return await this.userInformationsRepository.find({
      where: { userId },
      select: ['id'],
      order: { createdAt: 'ASC' }
    })
  }

  private async findUserInformationsIds(userId: string): Promise<string[]> {
    const userInformations = await this.findUserInformations(userId)
    return userInformations.map((item) => item.id)
  }

  private async findOwnedContact(userId: string, id: string): Promise<Contact> {
    const userInformationsIds = await this.findUserInformationsIds(userId)
    return await this.findOwnedContactByMappings(userInformationsIds, id)
  }

  private async findOwnedContactByMappings(
    userInformationsIds: string[],
    id: string
  ): Promise<Contact> {
    if (!userInformationsIds.length) {
      throw new NotFoundException('Contact not found')
    }

    const contact = await this.contactRepository.findOne({
      where: {
        id,
        userInformationsId: In(userInformationsIds)
      }
    })

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    return contact
  }

  private async assertPhoneIsAvailable(
    userInformationsIds: string[],
    phone: string,
    excludedContactId?: string
  ): Promise<void> {
    const duplicate = await this.contactRepository.findOne({
      where: {
        userInformationsId: In(userInformationsIds),
        phone,
        ...(excludedContactId ? { id: Not(excludedContactId) } : {})
      }
    })

    if (duplicate) {
      throw new ConflictException('Contact with this phone already exists')
    }
  }

  private normalizeRequiredValue(value: string, field: string): string {
    const normalizedValue = value.trim()

    if (!normalizedValue) {
      throw new BadRequestException(`${field} must not be empty`)
    }

    return normalizedValue
  }

  private normalizeOptionalValue(value?: string): string | null {
    const normalizedValue = value?.trim()
    return normalizedValue || null
  }

  private async saveContact(contact: Contact): Promise<Contact> {
    try {
      return await this.contactRepository.save(contact)
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Contact with this phone already exists')
      }

      throw error
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false
    }

    const driverError = error.driverError as unknown

    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505'
    )
  }
}

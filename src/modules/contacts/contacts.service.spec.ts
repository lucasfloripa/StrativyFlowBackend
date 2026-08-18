import { ConflictException, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'

import { UserInformations } from '../user/entities/user-informations.entity'

import { Contact } from './contact.entity'
import { ContactsService } from './contacts.service'
import { CreateContactDto } from './dto/create-contact.dto'

describe('ContactsService', () => {
  const contact = Object.assign(new Contact(), {
    id: 'contact-1',
    userInformationsId: 'user-info-1',
    name: 'João da Silva',
    phone: '+5548999999999',
    company: 'Strativy',
    instagram: '@strativy',
    createdAt: new Date('2026-08-18T10:00:00.000Z'),
    updatedAt: new Date('2026-08-18T10:00:00.000Z')
  })

  const createService = () => {
    const contactRepository = {
      create: jest.fn((input: Partial<Contact>) =>
        Object.assign(new Contact(), input)
      ),
      save: jest.fn((input: Contact) =>
        Promise.resolve(
          Object.assign(input, { id: input.id ?? 'contact-created' })
        )
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn((input: Contact) => Promise.resolve(input))
    }
    const userInformationsRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          Object.assign(new UserInformations(), { id: 'user-info-1' })
        ])
    }
    const service = new ContactsService(
      contactRepository as unknown as Repository<Contact>,
      userInformationsRepository as unknown as Repository<UserInformations>
    )

    return {
      service,
      contactRepository,
      userInformationsRepository
    }
  }

  it('creates a Contact for the authenticated user information mapping', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(null)

    const created = await dependencies.service.create('user-1', {
      name: '  João da Silva  ',
      phone: '  +5548999999999  ',
      company: '  Strativy  ',
      instagram: '  @strativy  '
    })

    expect(dependencies.contactRepository.create).toHaveBeenCalledWith({
      userInformationsId: 'user-info-1',
      name: 'João da Silva',
      phone: '+5548999999999',
      company: 'Strativy',
      instagram: '@strativy'
    })
    expect(created.id).toBe('contact-created')
  })

  it('lists only Contacts from the authenticated user mappings in newest-first order', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      Object.assign(new UserInformations(), { id: 'user-info-1' }),
      Object.assign(new UserInformations(), { id: 'user-info-2' })
    ])
    dependencies.contactRepository.find.mockResolvedValue([contact])

    await expect(dependencies.service.findAll('user-1')).resolves.toEqual([
      contact
    ])
    expect(dependencies.contactRepository.find).toHaveBeenCalledTimes(1)
  })

  it('finds an owned Contact by id and authenticated user mappings', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(contact)

    await expect(
      dependencies.service.findOne('user-1', contact.id)
    ).resolves.toBe(contact)
    expect(dependencies.contactRepository.findOne).toHaveBeenCalledTimes(1)
  })

  it('updates Contact name, phone, company, and instagram', async () => {
    const dependencies = createService()
    const editableContact = Object.assign(new Contact(), contact)
    dependencies.contactRepository.findOne
      .mockResolvedValueOnce(editableContact)
      .mockResolvedValueOnce(null)

    const updated = await dependencies.service.update(
      'user-1',
      editableContact.id,
      {
        name: '  Maria da Silva ',
        phone: ' +5548888888888 ',
        company: '  Empresa nova ',
        instagram: '  @empresa_nova '
      }
    )

    expect(updated.name).toBe('Maria da Silva')
    expect(updated.phone).toBe('+5548888888888')
    expect(updated.company).toBe('Empresa nova')
    expect(updated.instagram).toBe('@empresa_nova')
    expect(dependencies.contactRepository.save).toHaveBeenCalledWith(
      editableContact
    )
  })

  it('clears optional Contact fields when they are empty', async () => {
    const dependencies = createService()
    const editableContact = Object.assign(new Contact(), contact)
    dependencies.contactRepository.findOne.mockResolvedValue(editableContact)

    const updated = await dependencies.service.update(
      'user-1',
      editableContact.id,
      { company: '  ', instagram: '' }
    )

    expect(updated.company).toBeNull()
    expect(updated.instagram).toBeNull()
  })

  it('removes an owned Contact', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(contact)

    await expect(
      dependencies.service.remove('user-1', contact.id)
    ).resolves.toBe(contact)
    expect(dependencies.contactRepository.remove).toHaveBeenCalledWith(contact)
  })

  it('rejects a duplicate phone in any mapping owned by the same user', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      Object.assign(new UserInformations(), { id: 'user-info-1' }),
      Object.assign(new UserInformations(), { id: 'user-info-2' })
    ])
    dependencies.contactRepository.findOne.mockResolvedValue(contact)

    await expect(
      dependencies.service.create('user-1', {
        name: 'Outro contato',
        phone: contact.phone
      })
    ).rejects.toBeInstanceOf(ConflictException)
    expect(dependencies.contactRepository.save).not.toHaveBeenCalled()
  })

  it('allows the same phone in a different authenticated account', async () => {
    const dependencies = createService()
    dependencies.userInformationsRepository.find.mockResolvedValue([
      Object.assign(new UserInformations(), { id: 'other-user-info' })
    ])
    dependencies.contactRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.create('user-2', {
        name: 'Contato de outra conta',
        phone: contact.phone
      })
    ).resolves.toEqual(
      expect.objectContaining({
        userInformationsId: 'other-user-info',
        phone: contact.phone
      })
    )
  })

  it('does not expose a Contact owned by another user', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.findOne('user-2', contact.id)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('does not update a Contact owned by another user', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.update('user-2', contact.id, { name: 'Inválido' })
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(dependencies.contactRepository.save).not.toHaveBeenCalled()
  })

  it('does not remove a Contact owned by another user', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(null)

    await expect(
      dependencies.service.remove('user-2', contact.id)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(dependencies.contactRepository.remove).not.toHaveBeenCalled()
  })

  it('ignores userInformationsId supplied by the client body', async () => {
    const dependencies = createService()
    dependencies.contactRepository.findOne.mockResolvedValue(null)
    const dto = Object.assign(new CreateContactDto(), {
      name: 'João da Silva',
      phone: '+5548999999999',
      company: undefined,
      instagram: undefined,
      userInformationsId: 'attacker-user-info'
    })

    await dependencies.service.create('user-1', dto)

    expect(dependencies.contactRepository.create).toHaveBeenCalledWith({
      userInformationsId: 'user-info-1',
      name: dto.name,
      phone: dto.phone,
      company: null,
      instagram: null
    })
  })
})

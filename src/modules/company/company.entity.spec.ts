import { getMetadataArgsStorage } from 'typeorm'

import { Lead } from '../leads/entities/lead.entity'
import { UserInformations } from '../user/entities/user-informations.entity'

import { Company } from './company.entity'

describe('Company entity', () => {
  it('maps the company table, name, timestamps, and one-to-many relations', () => {
    const metadata = getMetadataArgsStorage()
    const columns = metadata.columns.filter(
      (column) => column.target === Company
    )
    const relations = metadata.relations.filter(
      (relation) => relation.target === Company
    )

    expect(
      metadata.tables.find((table) => table.target === Company)?.name
    ).toBe('companies')
    expect(columns.map((column) => column.propertyName)).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'companyPhoneNumber',
        'companyPhoneNumberId',
        'whatsappToken',
        'messengerPageId',
        'messengerToken',
        'instagramAccountId',
        'instagramToken',
        'createdAt',
        'updatedAt'
      ])
    )
    expect(
      relations.find((relation) => relation.propertyName === 'leads')
        ?.relationType
    ).toBe('one-to-many')
    expect(
      relations.find((relation) => relation.propertyName === 'userInformations')
        ?.relationType
    ).toBe('one-to-many')
    expect(Lead).toBeDefined()
  })

  it('maps lead company as an optional many-to-one relation with set-null deletion', () => {
    const metadata = getMetadataArgsStorage()
    const companyIdColumn = metadata.columns.find(
      (column) => column.target === Lead && column.propertyName === 'companyId'
    )
    const companyRelation = metadata.relations.find(
      (relation) =>
        relation.target === Lead && relation.propertyName === 'company'
    )

    expect(companyIdColumn?.options.nullable).toBe(true)
    expect(companyRelation?.relationType).toBe('many-to-one')
    expect(companyRelation?.options.nullable).toBe(true)
    expect(companyRelation?.options.onDelete).toBe('SET NULL')
  })

  it('stores the optional company relation on UserInformations', () => {
    const metadata = getMetadataArgsStorage()
    const companyIdColumn = metadata.columns.find(
      (column) =>
        column.target === UserInformations &&
        column.propertyName === 'companyId'
    )
    const companyRelation = metadata.relations.find(
      (relation) =>
        relation.target === UserInformations &&
        relation.propertyName === 'company'
    )

    expect(companyIdColumn?.options.nullable).toBe(true)
    expect(companyRelation?.relationType).toBe('many-to-one')
    expect(companyRelation?.options.nullable).toBe(true)
    expect(companyRelation?.options.onDelete).toBe('SET NULL')
  })
})

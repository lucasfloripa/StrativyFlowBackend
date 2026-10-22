import { INestApplication, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { App } from 'supertest/types'
import { In, Repository } from 'typeorm'

import { FollowUpStepController } from '../followup/controllers/followup-step.controller'
import { FollowUpController } from '../followup/controllers/followup.controller'
import { FollowUpStep } from '../followup/entities/followup-step.entity'
import { FollowUp } from '../followup/entities/followup.entity'
import { FollowUpStepService } from '../followup/services/followup-step.service'
import { FollowUpService } from '../followup/services/followup.service'
import { NegotiationAttachmentController } from '../negotiation/controllers/negotiation-attachment.controller'
import { NegotiationCostController } from '../negotiation/controllers/negotiation-cost.controller'
import { NegotiationFinancialController } from '../negotiation/controllers/negotiation-financial.controller'
import { NegotiationPaymentController } from '../negotiation/controllers/negotiation-payment.controller'
import { Negotiation } from '../negotiation/entities/negotiation.entity'
import { NegotiationController } from '../negotiation/negotiation.controller'
import { NegotiationService } from '../negotiation/negotiation.service'
import { NegotiationAttachmentService } from '../negotiation/services/negotiation-attachment.service'
import { NegotiationCostService } from '../negotiation/services/negotiation-cost.service'
import { NegotiationFinancialService } from '../negotiation/services/negotiation-financial.service'
import { NegotiationPaymentService } from '../negotiation/services/negotiation-payment.service'

import { CompanyAccessModule } from './company-access.module'
import { CompanyAccessService } from './company-access.service'

const ownId = '00000000-0000-4000-8000-000000000001'
const foreignId = '00000000-0000-4000-8000-000000000002'
const secret = 'company-access-test-secret'

describe('Company HTTP isolation', () => {
  let app: INestApplication<App>
  const previousSecret = process.env.JWT_SECRET
  const services = {
    create: jest.fn().mockResolvedValue({}),
    createTree: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
    listAttachments: jest.fn().mockResolvedValue([]),
    getDownloadUrl: jest.fn().mockResolvedValue({}),
    uploadAttachment: jest.fn().mockResolvedValue({}),
    deleteAttachment: jest.fn().mockResolvedValue({})
  }
  const access = {
    companyIdsForUser: jest.fn((userId: string) =>
      Promise.resolve([userId === 'user-3' ? 'company-2' : 'company-1'])
    ),
    assertResource: jest.fn((userId: string, _resource: string, id: string) => {
      if (userId === 'user-3' || id === foreignId)
        return Promise.reject(new NotFoundException())
      return Promise.resolve()
    })
  }
  const token = (userId = 'user-1') =>
    `Bearer ${jwt.sign({ userId }, secret, { expiresIn: '1h' })}`

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const module = await Test.createTestingModule({
      imports: [CompanyAccessModule],
      controllers: [
        NegotiationController,
        FollowUpController,
        FollowUpStepController,
        NegotiationAttachmentController,
        NegotiationFinancialController,
        NegotiationCostController,
        NegotiationPaymentController
      ],
      providers: [
        NegotiationService,
        FollowUpService,
        FollowUpStepService,
        NegotiationAttachmentService,
        NegotiationFinancialService,
        NegotiationCostService,
        NegotiationPaymentService
      ].map((provide) => ({ provide, useValue: services }))
    })
      .overrideProvider(CompanyAccessService)
      .useValue(access)
      .compile()
    app = module.createNestApplication()
    await app.init()
  })
  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => {
    await app.close()
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  })

  const routes = [
    `/negotiations/${ownId}`,
    `/followups/${ownId}`,
    `/followup-steps/${ownId}`,
    `/negotiations/${ownId}/attachments`,
    `/negotiations/attachments/${ownId}/download`,
    `/negotiations/${ownId}/financial`,
    `/negotiations/${ownId}/financial/costs`,
    `/negotiations/${ownId}/financial/payments`
  ]
  it.each(routes)('requires JWT for GET %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401)
    expect(access.assertResource).not.toHaveBeenCalled()
  })
  it.each(routes)('denies a different Company for GET %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', token('user-3'))
      .expect(404)
    expect(services.findOne).not.toHaveBeenCalled()
    expect(services.findAll).not.toHaveBeenCalled()
  })
  it.each(['user-1', 'user-2'])(
    'allows %s from the same Company',
    async (userId) => {
      await request(app.getHttpServer())
        .get(`/negotiations/${ownId}`)
        .set('Authorization', token(userId))
        .expect(200)
      expect(access.assertResource).toHaveBeenCalledWith(
        userId,
        'negotiation',
        ownId
      )
    }
  )
  it.each(['/negotiations', '/followups', '/followup-steps'])(
    'passes Company scope to GET %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', token())
        .expect(200)
      expect(access.companyIdsForUser).toHaveBeenCalledWith('user-1')
      if (path === '/followups')
        expect(services.findAll).toHaveBeenCalledWith(['company-1'])
      else
        expect(services.findAll).toHaveBeenCalledWith(undefined, ['company-1'])
    }
  )
  it.each([
    ['/negotiations', { leadId: foreignId }],
    ['/followups', { negotiationId: foreignId }],
    ['/followup-steps', { followUpId: foreignId }],
    ['/followup-steps/tree', { followUpId: foreignId }]
  ])('rejects cross-Company creation at %s', async (path, body) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', token())
      .send(body)
      .expect(404)
    expect(services.create).not.toHaveBeenCalled()
    expect(services.createTree).not.toHaveBeenCalled()
  })
  it('rejects moving a negotiation to a foreign lead', async () => {
    await request(app.getHttpServer())
      .patch(`/negotiations/${ownId}`)
      .set('Authorization', token())
      .send({ leadId: foreignId })
      .expect(404)
    expect(services.update).not.toHaveBeenCalled()
  })
  it('rejects a foreign parent step inside follow-up creation', async () => {
    await request(app.getHttpServer())
      .post('/followups')
      .set('Authorization', token())
      .send({ negotiationId: ownId, steps: [{ parentId: foreignId }] })
      .expect(404)
    expect(services.create).not.toHaveBeenCalled()
  })
  it('rejects a foreign follow-up filter', async () => {
    await request(app.getHttpServer())
      .get(`/followup-steps?followUpId=${foreignId}`)
      .set('Authorization', token())
      .expect(404)
    expect(services.findAll).not.toHaveBeenCalled()
  })
  it.each([
    `/negotiations/${ownId}/financial/costs/${foreignId}`,
    `/negotiations/${ownId}/financial/payments/${foreignId}`,
    `/negotiations/attachments/${foreignId}`
  ])('rejects deleting a foreign child at %s', async (path) => {
    await request(app.getHttpServer())
      .delete(path)
      .set('Authorization', token())
      .expect(404)
    expect(services.remove).not.toHaveBeenCalled()
    expect(services.deleteAttachment).not.toHaveBeenCalled()
  })
  it('rejects malformed resource identifiers before querying', async () => {
    await request(app.getHttpServer())
      .get('/negotiations/not-a-uuid')
      .set('Authorization', token())
      .expect(400)
    expect(access.assertResource).not.toHaveBeenCalled()
  })
})

describe('Company collection queries', () => {
  it('filters negotiations by lead Company even without a leadId filter', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) }
    const service = new NegotiationService(
      repository as unknown as Repository<Negotiation>,
      {} as Repository<FollowUp>
    )
    await service.findAll(undefined, ['company-1'])
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lead: { companyId: In(['company-1']) } }
      })
    )
  })
  it('filters follow-ups by negotiation lead Company', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) }
    const service = new FollowUpService(
      repository as unknown as Repository<FollowUp>,
      {} as Repository<Negotiation>
    )
    await service.findAll(['company-1'])
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { negotiation: { lead: { companyId: In(['company-1']) } } }
      })
    )
  })
  it('filters steps by follow-up lead Company, including empty membership', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) }
    const service = new FollowUpStepService(
      repository as unknown as Repository<FollowUpStep>,
      {} as Repository<FollowUp>
    )
    await service.findAll(undefined, [])
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { followUp: { negotiation: { lead: { companyId: In([]) } } } }
      })
    )
  })
})

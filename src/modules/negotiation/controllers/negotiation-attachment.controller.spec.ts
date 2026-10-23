import { ExecutionContext, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { CompanyAccessGuard } from '../../auth/company-access.guard'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import {
  NEGOTIATION_ATTACHMENT_MAX_SIZE_IN_BYTES,
  NegotiationAttachmentService
} from '../services/negotiation-attachment.service'

import { NegotiationAttachmentController } from './negotiation-attachment.controller'

import type { App } from 'supertest/types'

describe('NegotiationAttachmentController', () => {
  let app: INestApplication<App>
  const attachmentService = {
    uploadAttachment: jest.fn().mockResolvedValue({ id: 'attachment-1' })
  }
  const allowAuthenticatedUser = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user?: object }>().user = {
        id: 'user-1'
      }
      return true
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NegotiationAttachmentController],
      providers: [
        {
          provide: NegotiationAttachmentService,
          useValue: attachmentService
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAuthenticatedUser)
      .overrideGuard(CompanyAccessGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    attachmentService.uploadAttachment.mockClear()
  })

  describe('upload', () => {
    it('accepts a file within the attachment size limit', async () => {
      await request(app.getHttpServer())
        .post('/negotiations/negotiation-1/attachments')
        .attach('file', Buffer.from('contract'), 'contrato.pdf')
        .expect(201)

      expect(attachmentService.uploadAttachment).toHaveBeenCalledWith(
        'negotiation-1',
        expect.objectContaining({ originalname: 'contrato.pdf' }),
        'user-1'
      )
    })

    it('rejects a file above the limit with 413 before reaching the service', async () => {
      await request(app.getHttpServer())
        .post('/negotiations/negotiation-1/attachments')
        .attach(
          'file',
          Buffer.alloc(NEGOTIATION_ATTACHMENT_MAX_SIZE_IN_BYTES + 1),
          'grande.pdf'
        )
        .expect(413)

      expect(attachmentService.uploadAttachment).not.toHaveBeenCalled()
    })
  })
})

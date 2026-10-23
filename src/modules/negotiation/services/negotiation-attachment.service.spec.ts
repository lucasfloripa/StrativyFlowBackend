import { Repository } from 'typeorm'

import { createMockRepository, FIXED_DATE } from '../../../testing'
import {
  StorageService,
  StorageUploadFile
} from '../../storage/storage.service'
import { NegotiationAttachment } from '../entities/negotiation-attachment.entity'
import { Negotiation } from '../entities/negotiation.entity'

import { NegotiationAttachmentService } from './negotiation-attachment.service'

describe('NegotiationAttachmentService', () => {
  const buildFile = (originalname: string): StorageUploadFile => ({
    originalname,
    mimetype: 'application/pdf',
    size: 8,
    buffer: Buffer.from('contract')
  })

  const setup = () => {
    const negotiationRepository = createMockRepository<Negotiation>()
    negotiationRepository.findOne.mockResolvedValue({
      id: 'negotiation-1',
      leadId: 'lead-1'
    })
    const attachmentRepository = createMockRepository<NegotiationAttachment>()
    attachmentRepository.save.mockImplementation(
      (attachment: NegotiationAttachment) =>
        Promise.resolve({
          ...attachment,
          id: 'attachment-1',
          createdAt: FIXED_DATE
        })
    )
    const storageService = {
      uploadFile: jest.fn(
        (_file: StorageUploadFile, options: { key: string }) =>
          Promise.resolve({ key: options.key })
      ),
      generatePresignedUrl: jest.fn().mockResolvedValue('https://signed.url')
    }
    const service = new NegotiationAttachmentService(
      negotiationRepository as unknown as Repository<Negotiation>,
      attachmentRepository as unknown as Repository<NegotiationAttachment>,
      storageService as unknown as StorageService
    )

    return { service, attachmentRepository, storageService }
  }

  describe('uploadAttachment', () => {
    it('stores files with the same name under different keys', async () => {
      const { service, storageService } = setup()

      await service.uploadAttachment(
        'negotiation-1',
        buildFile('contrato.pdf'),
        'user-1'
      )
      await service.uploadAttachment(
        'negotiation-1',
        buildFile('contrato.pdf'),
        'user-1'
      )

      const [first, second] = storageService.uploadFile.mock.calls.map(
        ([, options]) => options.key
      )
      expect(first).not.toBe(second)
      expect(first).toMatch(
        /^leads\/lead-1\/negotiations\/negotiation-1\/attachments\/[0-9a-f-]{36}\.pdf$/
      )
    })

    it('keeps the original file name on the attachment record', async () => {
      const { service, attachmentRepository } = setup()

      await service.uploadAttachment(
        'negotiation-1',
        buildFile('contrato assinado.pdf'),
        'user-1'
      )

      expect(attachmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: 'contrato assinado.pdf',
          extension: 'pdf'
        })
      )
    })
  })

  describe('getDownloadUrl', () => {
    it('signs the download with the original file name', async () => {
      const { service, attachmentRepository, storageService } = setup()
      attachmentRepository.findOne.mockResolvedValue({
        id: 'attachment-1',
        key: 'leads/lead-1/negotiations/negotiation-1/attachments/uuid.pdf',
        originalName: 'contrato.pdf'
      })

      await expect(service.getDownloadUrl('attachment-1')).resolves.toEqual({
        url: 'https://signed.url',
        expiresIn: 3600
      })
      expect(storageService.generatePresignedUrl).toHaveBeenCalledWith(
        'leads/lead-1/negotiations/negotiation-1/attachments/uuid.pdf',
        3600,
        'contrato.pdf'
      )
    })
  })
})

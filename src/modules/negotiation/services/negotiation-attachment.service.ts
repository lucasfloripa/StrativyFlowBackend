import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { extname } from 'path'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'

import { StorageService, StorageUploadFile } from '../../storage/storage.service'

import { NegotiationAttachmentDownloadUrlDto } from '../dto/negotiation-attachment-download-url.dto'
import { NegotiationAttachmentResponseDto } from '../dto/negotiation-attachment-response.dto'
import { NegotiationAttachment } from '../entities/negotiation-attachment.entity'
import { Negotiation } from '../entities/negotiation.entity'

const MAX_FILE_SIZE_IN_BYTES = 20 * 1024 * 1024
const PRESIGNED_URL_EXPIRATION_SECONDS = 3600

const allowedExtensions = new Set<string>([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'zip',
  'rar',
  '7z'
])

@Injectable()
export class NegotiationAttachmentService {
  constructor(
    @InjectRepository(Negotiation)
    private readonly negotiationRepository: Repository<Negotiation>,
    @InjectRepository(NegotiationAttachment)
    private readonly attachmentRepository: Repository<NegotiationAttachment>,
    private readonly storageService: StorageService
  ) {}

  async uploadAttachment(
    negotiationId: string,
    file: StorageUploadFile | undefined,
    uploadedByUserId: string
  ): Promise<NegotiationAttachmentResponseDto> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId },
      select: { id: true }
    })

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`)
    }

    this.validateUploadFile(file)

    const extension = this.extractFileExtension(file.originalname)
    const key = this.buildStorageKey(negotiationId, extension)

    const uploadResult = await this.storageService.uploadFile(file, { key })

    const attachment = this.attachmentRepository.create({
      negotiationId,
      key: uploadResult.key,
      originalName: file.originalname,
      mimeType: file.mimetype,
      extension,
      size: file.size,
      uploadedByUserId
    })

    const createdAttachment = await this.attachmentRepository.save(attachment)

    return this.toResponseDto(createdAttachment)
  }

  async listAttachments(
    negotiationId: string
  ): Promise<NegotiationAttachmentResponseDto[]> {
    const negotiation = await this.negotiationRepository.findOne({
      where: { id: negotiationId },
      select: { id: true }
    })

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`)
    }

    const attachments = await this.attachmentRepository.find({
      where: { negotiationId },
      order: { createdAt: 'DESC' }
    })

    return attachments.map((attachment) => this.toResponseDto(attachment))
  }

  async getDownloadUrl(
    attachmentId: string
  ): Promise<NegotiationAttachmentDownloadUrlDto> {
    const attachment = await this.findAttachmentOrFail(attachmentId)

    return await this.storageService.generateDownloadPresignedUrl(
      attachment.key,
      PRESIGNED_URL_EXPIRATION_SECONDS
    )
  }

  async deleteAttachment(attachmentId: string): Promise<{ success: true }> {
    const attachment = await this.findAttachmentOrFail(attachmentId)

    await this.storageService.deleteFile(attachment.key)
    await this.attachmentRepository.remove(attachment)

    return { success: true }
  }

  private toResponseDto(
    attachment: NegotiationAttachment
  ): NegotiationAttachmentResponseDto {
    return {
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      extension: attachment.extension,
      size: attachment.size,
      createdAt: attachment.createdAt,
      uploadedByUserId: attachment.uploadedByUserId
    }
  }

  private validateUploadFile(file: StorageUploadFile | undefined): asserts file is StorageUploadFile {
    if (!file) {
      throw new BadRequestException('Arquivo nao enviado.')
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo vazio.')
    }

    if (file.size > MAX_FILE_SIZE_IN_BYTES) {
      throw new BadRequestException('File size exceeds the maximum allowed size of 20 MB.')
    }

    const extension = this.extractFileExtension(file.originalname)

    if (!allowedExtensions.has(extension)) {
      throw new BadRequestException('Unsupported file type.')
    }
  }

  private extractFileExtension(originalName: string): string {
    const extension = extname(originalName).replace('.', '').toLowerCase()

    if (!extension) {
      throw new BadRequestException('Unsupported file type.')
    }

    return extension
  }

  private buildStorageKey(negotiationId: string, extension: string): string {
    return `negotiations/${negotiationId}/${randomUUID()}.${extension}`
  }

  private async findAttachmentOrFail(
    attachmentId: string
  ): Promise<NegotiationAttachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId }
    })

    if (!attachment) {
      throw new NotFoundException(`Negotiation attachment ${attachmentId} not found`)
    }

    return attachment
  }
}

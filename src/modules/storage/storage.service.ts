import { randomUUID } from 'crypto'
import { extname } from 'path'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DeleteFileResponseDto } from './dto/delete-file-response.dto'
import { UploadFileResponseDto } from './dto/upload-file-response.dto'
import { R2_S3_CLIENT } from './storage.constants'

export type StorageUploadFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

type StorageUploadOptions = {
  key?: string
}

type PresignedUrlResponse = {
  url: string
  expiresIn: number
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  private readonly bucketName: string
  private readonly endpoint: string

  constructor(
    @Inject(R2_S3_CLIENT) private readonly s3Client: S3Client,
    private readonly configService: ConfigService
  ) {
    this.bucketName = this.configService.getOrThrow<string>('R2_BUCKET_NAME')
    this.endpoint = this.configService
      .getOrThrow<string>('R2_ENDPOINT')
      .replace(/\/+$/, '')
  }

  async uploadFile(
    file: StorageUploadFile | undefined,
    options?: StorageUploadOptions
  ): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new BadRequestException('Arquivo nao enviado.')
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo vazio.')
    }

    const key = options?.key?.trim() || this.buildObjectKey(file.originalname)

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      )

      return {
        key,
        url: `${this.endpoint}/${this.bucketName}/${key}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      }
    } catch (error: unknown) {
      this.logger.error('Falha ao enviar arquivo para o R2.', {
        key,
        originalName: file.originalname,
        error
      })

      throw new InternalServerErrorException(
        'Falha ao enviar arquivo para o storage.'
      )
    }
  }

  async deleteFile(key: string): Promise<DeleteFileResponseDto> {
    if (!key) {
      throw new BadRequestException('Key do arquivo e obrigatoria.')
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key
        })
      )

      return {
        success: true
      }
    } catch (error: unknown) {
      this.logger.error('Falha ao excluir arquivo do R2.', {
        key,
        error
      })

      throw new InternalServerErrorException(
        'Falha ao excluir arquivo do storage.'
      )
    }
  }

  async generateDownloadPresignedUrl(
    key: string,
    expiresIn = 3600
  ): Promise<PresignedUrlResponse> {
    if (!key) {
      throw new BadRequestException('Key do arquivo e obrigatoria.')
    }

    if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
      throw new BadRequestException('Tempo de expiracao invalido.')
    }

    try {
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        }),
        { expiresIn }
      )

      return {
        url,
        expiresIn
      }
    } catch (error: unknown) {
      this.logger.error('Falha ao gerar presigned URL do R2.', {
        key,
        expiresIn,
        error
      })

      throw new InternalServerErrorException(
        'Falha ao gerar URL temporaria do arquivo.'
      )
    }
  }

  async generatePresignedUrl(
    key: string,
    expiresIn = 600,
    downloadFileName?: string
  ): Promise<string> {
    if (!key) {
      throw new BadRequestException('Key do arquivo e obrigatoria.')
    }

    if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
      throw new BadRequestException('Tempo de expiracao invalido.')
    }

    try {
      return await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          ...(downloadFileName?.trim()
            ? {
                ResponseContentDisposition:
                  this.buildAttachmentContentDisposition(downloadFileName)
              }
            : {})
        }),
        { expiresIn }
      )
    } catch (error: unknown) {
      this.logger.error('Falha ao gerar presigned URL do R2.', {
        key,
        expiresIn,
        error
      })

      throw new InternalServerErrorException(
        'Falha ao gerar URL temporaria do arquivo.'
      )
    }
  }

  private buildObjectKey(originalName: string): string {
    const extension = extname(originalName)
    return `${randomUUID()}${extension}`
  }

  private buildAttachmentContentDisposition(fileName: string): string {
    const trimmedFileName = fileName.trim()
    const fallbackFileName =
      trimmedFileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') ||
      'download'
    const encodedFileName = encodeURIComponent(trimmedFileName).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )

    return `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`
  }
}

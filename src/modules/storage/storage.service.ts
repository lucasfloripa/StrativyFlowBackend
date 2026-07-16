import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import { Readable } from 'stream'

import { R2_S3_CLIENT } from './storage.constants'
import { DeleteFileResponseDto } from './dto/delete-file-response.dto'
import { UploadFileResponseDto } from './dto/upload-file-response.dto'

export type StorageUploadFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

type DownloadFileResult = {
  stream: Readable
  contentType: string
  contentLength?: number
}

type AwsRequestError = {
  name?: string
  $metadata?: {
    httpStatusCode?: number
  }
}

type StreamWithTransformToByteArray = {
  transformToByteArray: () => Promise<Uint8Array>
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

      throw new InternalServerErrorException('Falha ao enviar arquivo para o storage.')
    }
  }

  async downloadFile(key: string): Promise<DownloadFileResult> {
    if (!key) {
      throw new BadRequestException('Key do arquivo e obrigatoria.')
    }

    try {
      const output = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        })
      )

      const stream = await this.toNodeReadable(output.Body)

      return {
        stream,
        contentType: output.ContentType ?? 'application/octet-stream',
        contentLength: output.ContentLength
      }
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException('Arquivo nao encontrado.')
      }

      this.logger.error('Falha ao baixar arquivo do R2.', {
        key,
        error
      })

      throw new InternalServerErrorException('Falha ao baixar arquivo do storage.')
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

      throw new InternalServerErrorException('Falha ao excluir arquivo do storage.')
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

      throw new InternalServerErrorException('Falha ao gerar URL temporaria do arquivo.')
    }
  }

  private buildObjectKey(originalName: string): string {
    const extension = extname(originalName)
    return `${randomUUID()}${extension}`
  }

  private async toNodeReadable(body: GetObjectCommandOutput['Body']): Promise<Readable> {
    if (!body) {
      throw new NotFoundException('Arquivo nao encontrado.')
    }

    if (body instanceof Readable) {
      return body
    }

    if (this.hasTransformToByteArray(body)) {
      const bytes = await body.transformToByteArray()
      return Readable.from(Buffer.from(bytes))
    }

    throw new InternalServerErrorException('Formato de stream do arquivo nao suportado.')
  }

  private hasTransformToByteArray(value: unknown): value is StreamWithTransformToByteArray {
    return (
      typeof value === 'object' &&
      value !== null &&
      'transformToByteArray' in value &&
      typeof value.transformToByteArray === 'function'
    )
  }

  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false
    }

    const awsError = error as AwsRequestError

    return (
      awsError.name === 'NoSuchKey' ||
      awsError.name === 'NotFound' ||
      awsError.$metadata?.httpStatusCode === 404
    )
  }
}

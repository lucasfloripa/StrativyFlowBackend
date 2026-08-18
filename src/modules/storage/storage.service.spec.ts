import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { StorageService } from './storage.service'

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn()
}))

describe('StorageService', () => {
  const mockedGetSignedUrl = jest.mocked(getSignedUrl)

  const createService = () => {
    const s3Client = {
      send: jest.fn()
    } as unknown as S3Client
    const configValues = {
      R2_BUCKET_NAME: 'private-bucket',
      R2_ENDPOINT: 'https://r2.example.com'
    }
    const configService = {
      getOrThrow: jest.fn((key: keyof typeof configValues) => configValues[key])
    } as unknown as ConfigService

    return {
      service: new StorageService(s3Client, configService),
      s3Client
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetSignedUrl.mockResolvedValue(
      'https://r2.example.com/private-bucket/uploads/document.pdf?X-Amz-Signature=signed'
    )
  })

  it('generates a download presigned URL using the requested expiration', async () => {
    const { service, s3Client } = createService()

    const url = await service.generatePresignedUrl('uploads/document.pdf', 120)

    expect(url).toContain('X-Amz-Signature=signed')
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1)

    const [client, command, options] = mockedGetSignedUrl.mock.calls[0]
    expect(client).toBe(s3Client)
    expect(command).toBeInstanceOf(GetObjectCommand)
    expect(command.input).toEqual({
      Bucket: 'private-bucket',
      Key: 'uploads/document.pdf'
    })
    expect(options).toEqual({ expiresIn: 120 })
    expect(s3Client.send).not.toHaveBeenCalled()
  })

  it('uses 600 seconds as the default expiration', async () => {
    const { service } = createService()

    await service.generatePresignedUrl('uploads/document.pdf')

    expect(mockedGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(GetObjectCommand),
      { expiresIn: 600 }
    )
  })

  it('sets the original download file name in the signed response', async () => {
    const { service } = createService()

    await service.generatePresignedUrl(
      'uploads/document-id.pdf',
      600,
      'Relatório final.pdf'
    )

    const [, command] = mockedGetSignedUrl.mock.calls[0]
    expect(command.input).toEqual({
      Bucket: 'private-bucket',
      Key: 'uploads/document-id.pdf',
      ResponseContentDisposition:
        'attachment; filename="Relat_rio final.pdf"; filename*=UTF-8\'\'Relat%C3%B3rio%20final.pdf'
    })
  })

  it('rejects an empty key without accessing the bucket', async () => {
    const { service, s3Client } = createService()

    await expect(service.generatePresignedUrl('')).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(mockedGetSignedUrl).not.toHaveBeenCalled()
    expect(s3Client.send).not.toHaveBeenCalled()
  })
})

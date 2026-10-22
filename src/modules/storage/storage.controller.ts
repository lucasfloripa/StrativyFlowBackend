import {
  Controller,
  Delete,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards
} from '@nestjs/common'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { DeleteFileResponseDto } from './dto/delete-file-response.dto'
import { StorageService } from './storage.service'

import type { Response } from 'express'

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('download/:key')
  async download(
    @Param('key') key: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const file = await this.storageService.downloadFile(key)

    response.setHeader('Content-Type', file.contentType)
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(key)}"`
    )

    if (typeof file.contentLength === 'number') {
      response.setHeader('Content-Length', String(file.contentLength))
    }

    return new StreamableFile(file.stream)
  }

  @Delete(':key')
  remove(@Param('key') key: string): Promise<DeleteFileResponseDto> {
    return this.storageService.deleteFile(key)
  }
}

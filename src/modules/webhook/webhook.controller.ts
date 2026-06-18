import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res
} from '@nestjs/common'

import { WebhookService } from './webhook.service'

import type { Response } from 'express'

@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('whatsapp')
  @HttpCode(200)
  async handleWhatsAppWebhook(@Body() body: any) {
    const webhookVersion = process.env.WEBHOOK_VERSION

    if (webhookVersion === 'v1')
      return await this.webhookService.handleIncomingMessage(body)
    if (webhookVersion === 'v2')
      return await this.webhookService.handleIncomingMessageV2(body)
  }

  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }

    return res.status(403).send('Invalid verification token')
  }
}

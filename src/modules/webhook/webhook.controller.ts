import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
  UseGuards
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'

import { WEBHOOK_HANDSHAKE_THROTTLE } from '../rate-limit/rate-limit.constants'

import { MetaWebhookSignatureGuard } from './security/meta-webhook-signature.guard'
import { WebhookIngestionService } from './webhook-ingestion.service'

import type {
  InstagramDirectWebhookPayload,
  MessengerWebhookPayload,
  WhatsAppWebhookPayload
} from './inbound/meta-webhook-payload.types'
import type { Response } from 'express'

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name)

  constructor(
    private readonly webhookIngestionService: WebhookIngestionService
  ) {}

  @Post('whatsapp')
  @UseGuards(MetaWebhookSignatureGuard)
  @HttpCode(200)
  async handleWhatsAppWebhook(@Body() body: WhatsAppWebhookPayload) {
    return await this.webhookIngestionService.ingestWhatsApp(body)
  }

  @Post('messenger')
  @UseGuards(MetaWebhookSignatureGuard)
  @HttpCode(200)
  handleMessengerWebhook(@Body() body: MessengerWebhookPayload) {
    return this.webhookIngestionService.ingestMessenger(body)
  }

  @Post('direct')
  @UseGuards(MetaWebhookSignatureGuard)
  @HttpCode(200)
  async handleDirectWebhook(@Body() body: InstagramDirectWebhookPayload) {
    return await this.webhookIngestionService.ingestInstagram(body)
  }

  @Get('whatsapp')
  @UseGuards(ThrottlerGuard)
  @Throttle(WEBHOOK_HANDSHAKE_THROTTLE)
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

    this.logger.warn(
      `Rejected webhook verification. channel=whatsapp mode=${mode ?? 'missing'}`
    )
    return res.status(403).send('Invalid verification token')
  }

  @Get('messenger')
  @UseGuards(ThrottlerGuard)
  @Throttle(WEBHOOK_HANDSHAKE_THROTTLE)
  verifyMessengerWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }

    this.logger.warn(
      `Rejected webhook verification. channel=messenger mode=${mode ?? 'missing'}`
    )
    return res.status(403).send('Invalid verification token')
  }

  @Get('direct')
  @UseGuards(ThrottlerGuard)
  @Throttle(WEBHOOK_HANDSHAKE_THROTTLE)
  verifyDirectWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }

    this.logger.warn(
      `Rejected webhook verification. channel=direct mode=${mode ?? 'missing'}`
    )
    return res.status(403).send('Invalid verification token')
  }
}

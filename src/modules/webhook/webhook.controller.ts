import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res
} from '@nestjs/common'

import {
  type InstagramDirectWebhookPayload,
  type MessengerWebhookPayload,
  WebhookService,
  type WhatsAppWebhookPayload
} from './webhook.service'

import type { Response } from 'express'

@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('whatsapp')
  @HttpCode(200)
  async handleWhatsAppWebhook(@Body() body: WhatsAppWebhookPayload) {
    return await this.webhookService.handleIncomingMessage(body)
  }

  @Post('messenger')
  @HttpCode(200)
  handleMessengerWebhook(@Body() body: MessengerWebhookPayload) {
    return this.webhookService.handleMessengerWebhook(body)
  }

  @Post('direct')
  @HttpCode(200)
  async handleDirectWebhook(@Body() body: InstagramDirectWebhookPayload) {
    return await this.webhookService.handleDirectWebhook(body)
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

  @Get('messenger')
  verifyMessengerWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    console.log('Verifying Messenger webhook:', { mode, token, challenge })
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }

    return res.status(403).send('Invalid verification token')
  }

  @Get('direct')
  verifyDirectWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    console.log('Verifying Direct webhook:', { mode, token, challenge })
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }

    return res.status(403).send('Invalid verification token')
  }
}

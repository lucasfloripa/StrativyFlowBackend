import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'

import { AdminApiKeyGuard } from '../../auth/admin-api-key.guard'
import { ADMIN_ROUTE_THROTTLE } from '../../rate-limit/rate-limit.constants'
import { ReplayInboundEventsDto } from '../dto/replay-inbound-events.dto'
import { InboundEventInboxService } from '../inbound/inbound-event-inbox.service'

/** Platform operation of the webhook pipeline. Requires the admin API key. */
@Controller('admin/webhook')
// Throttler first, so wrong admin keys also count toward the limit.
@UseGuards(ThrottlerGuard, AdminApiKeyGuard)
@Throttle(ADMIN_ROUTE_THROTTLE)
export class WebhookAdminController {
  constructor(private readonly inboundEventInbox: InboundEventInboxService) {}

  /**
   * Replays `failed` inbound events (after a bug fix or an outage), at most
   * 500 per call. The worker processes them, so it must be running.
   */
  @Post('inbound-events/replay')
  @HttpCode(200)
  async replay(@Body() dto: ReplayInboundEventsDto) {
    const hasFilter =
      Boolean(dto.ids?.length) ||
      Boolean(dto.conversationKey) ||
      Boolean(dto.receivedFrom) ||
      Boolean(dto.receivedTo)

    if (!hasFilter) {
      throw new BadRequestException(
        'Give ids, conversationKey or a receivedFrom/receivedTo period'
      )
    }

    const { replayed } = await this.inboundEventInbox.replayFailed({
      ids: dto.ids,
      conversationKey: dto.conversationKey,
      receivedFrom: dto.receivedFrom ? new Date(dto.receivedFrom) : undefined,
      receivedTo: dto.receivedTo ? new Date(dto.receivedTo) : undefined,
      limit: dto.limit
    })
    return { replayed: replayed.length, ids: replayed }
  }
}

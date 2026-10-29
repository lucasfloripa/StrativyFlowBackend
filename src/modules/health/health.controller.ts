import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'

import { HEALTH_CHECK_THROTTLE } from '../rate-limit/rate-limit.constants'

import { HealthService } from './health.service'

/**
 * Public probe for the load balancer and uptime monitors: 200 while the API
 * can reach the database (`ok` or `degraded`), 503 when it cannot.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle(HEALTH_CHECK_THROTTLE)
  async check() {
    const report = await this.healthService.check()

    if (report.status === 'down') {
      throw new ServiceUnavailableException(report)
    }

    return report
  }
}

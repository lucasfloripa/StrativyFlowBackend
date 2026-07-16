import { Controller, UseGuards } from '@nestjs/common'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class ReminderController {
  // Test endpoint removed.
}

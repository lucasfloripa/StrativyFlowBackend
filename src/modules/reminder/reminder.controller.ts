import { Controller, Post, UseGuards } from '@nestjs/common'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { ReminderCronService } from './reminder-cron.service'

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class ReminderController {
  constructor(private readonly reminderCronService: ReminderCronService) {}

  @Post('test')
  async triggerTestDispatch() {
    return {
      newDate: new Date(),
      newDateISOString: new Date().toISOString(),
      newDateGetTimezoneOffset: new Date().getTimezoneOffset(),
      newDateGetTimezoneOffsetDateTimeFormat: new Date().toLocaleString(
        'en-US',
        { timeZone: 'America/Sao_Paulo' }
      )
    }
    // return await this.reminderCronService.dispatchDailyFollowUpReminders(
    //   'manual'
    // )
  }
}

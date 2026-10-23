import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'

import { AdminApiKeyGuard } from '../auth/admin-api-key.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ADMIN_ROUTE_THROTTLE } from '../rate-limit/rate-limit.constants'

import { CreateUserInformationsDto } from './dtos/create-user-informations.dto'
import { UpdateUserInformationsNotificationsDto } from './dtos/update-user-informations-notifications.dto'
import { UpdateUserInformationsPreferencesDto } from './dtos/update-user-informations-preferences.dto'
import { UpdateUserInformationsShortcutsDto } from './dtos/update-user-informations-shortcuts.dto'
import { toUserInformationsResponse } from './mappers/user-informations-response.mapper'
import { UserService } from './user.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('user-informations')
  async listUserInformations(@Req() req: AuthenticatedRequest) {
    const userInformations = await this.userService.findByUserId(req.user.id)
    return userInformations.map(toUserInformationsResponse)
  }

  /**
   * Platform onboarding: an administrator creates the UserInformations of
   * another user, so `userId` comes from the body. Requires the admin API key.
   */
  @Post('user-informations')
  // Throttler first, so wrong admin keys also count toward the limit.
  @UseGuards(ThrottlerGuard, AdminApiKeyGuard)
  @Throttle(ADMIN_ROUTE_THROTTLE)
  async createUserInformations(@Body() dto: CreateUserInformationsDto) {
    const userInformations = await this.userService.createUserInformations(dto)
    return toUserInformationsResponse(userInformations)
  }

  @Patch('user-informations/:id/notifications')
  async updateUserInformationsNotifications(
    @Param('id') _id: string,
    @Body() dto: UpdateUserInformationsNotificationsDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userInformations =
      await this.userService.updateUserInformationsNotificationsByUserId(
        req.user.id,
        dto
      )
    return toUserInformationsResponse(userInformations)
  }

  @Patch('user-informations/:id/preferences')
  async updateUserInformationsPreferences(
    @Param('id') _id: string,
    @Body() dto: UpdateUserInformationsPreferencesDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userInformations =
      await this.userService.updateUserInformationsPreferencesByUserId(
        req.user.id,
        dto
      )
    return toUserInformationsResponse(userInformations)
  }

  @Patch('user-informations/:id/shortcuts')
  async updateUserInformationsShortcuts(
    @Param('id') _id: string,
    @Body() dto: UpdateUserInformationsShortcutsDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userInformations =
      await this.userService.updateUserInformationsShortcutsByUserId(
        req.user.id,
        dto
      )
    return toUserInformationsResponse(userInformations)
  }
}

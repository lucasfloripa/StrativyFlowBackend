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
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { CreateUserInformationsDto } from './dtos/create-user-informations.dto'
import { UpdateUserInformationsNotificationsDto } from './dtos/update-user-informations-notifications.dto'
import { UpdateUserInformationsPreferencesDto } from './dtos/update-user-informations-preferences.dto'
import { UpdateUserInformationsShortcutsDto } from './dtos/update-user-informations-shortcuts.dto'
import { UserInformations } from './entities/user-informations.entity'
import { UserService } from './user.service'

type AuthenticatedRequest = Request & {
  user: {
    id: string
  }
}

const toPublicUserInformations = (userInformations: UserInformations) => {
  const publicUserInformations: Partial<UserInformations> = {
    ...userInformations
  }
  delete publicUserInformations.instagramToken

  return publicUserInformations
}

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('user-informations')
  async listUserInformations(@Req() req: AuthenticatedRequest) {
    const userInformations = await this.userService.findByUserId(req.user.id)
    return userInformations.map(toPublicUserInformations)
  }

  @Post('user-informations')
  async createUserInformations(@Body() dto: CreateUserInformationsDto) {
    const userInformations = await this.userService.createUserInformations(dto)
    return toPublicUserInformations(userInformations)
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
    return toPublicUserInformations(userInformations)
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
    return toPublicUserInformations(userInformations)
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
    return toPublicUserInformations(userInformations)
  }
}

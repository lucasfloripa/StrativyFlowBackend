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
    return await this.userService.findByUserId(req.user.id)
  }

  @Post('user-informations')
  async createUserInformations(@Body() dto: CreateUserInformationsDto) {
    return await this.userService.createUserInformations(dto)
  }

  @Patch('user-informations/:id/notifications')
  async updateUserInformationsNotifications(
    @Param('id') _id: string,
    @Body() dto: UpdateUserInformationsNotificationsDto,
    @Req() req: AuthenticatedRequest
  ) {
    return await this.userService.updateUserInformationsNotificationsByUserId(
      req.user.id,
      dto
    )
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { BoardService } from './board.service'
import { CreateBoardDto } from './dtos/create-board.dto'
import { Board } from './entities/board.entity'

type AuthenticatedRequest = Request & {
  user: {
    id: string
    userId: string
    role?: string
  }
}

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  async findAllFromAuthenticatedUser(
    @Req() req: AuthenticatedRequest
  ): Promise<Board[]> {
    const userId = req.user.userId ?? req.user.id
    return await this.boardService.findAllByUser(userId)
  }

  @Post()
  create(@Body() dto: CreateBoardDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId ?? req.user.id
    return this.boardService.create(userId, dto)
  }

  @Get(':id/full')
  findFull(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId ?? req.user.id
    return this.boardService.findFull(userId, id)
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { BoardColumnsService } from './board-columns.service'
import { CreateColumnDto } from './dtos/create-column.dto'
import { UpdateColumnDto } from './dtos/update-column.dto'

@Controller('boards/:boardId/columns')
@UseGuards(JwtAuthGuard)
export class BoardColumnsController {
  constructor(private readonly columnsService: BoardColumnsService) {}

  @Post()
  create(
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
    @Req() req: any
  ) {
    const userId = req.user.id
    return this.columnsService.create(userId, boardId, dto)
  }

  @Patch(':columnId')
  update(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
    @Req() req: any
  ) {
    const userId = req.user.id
    return this.columnsService.update(userId, boardId, columnId, dto)
  }

  @Delete(':columnId')
  remove(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Req() req: any
  ) {
    const userId = req.user.id
    return this.columnsService.remove(userId, boardId, columnId)
  }
}

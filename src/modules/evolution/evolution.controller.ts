import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { IsNotEmpty, IsString } from 'class-validator'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { EvolutionService } from './evolution.service'

class SendEvolutionTestMessageDto {
  @IsString()
  @IsNotEmpty()
  phone!: string

  @IsString()
  @IsNotEmpty()
  message!: string
}

@Controller('evolution')
@UseGuards(JwtAuthGuard)
export class EvolutionController {
  constructor(private readonly evolutionService: EvolutionService) {}

  @Post('test')
  sendTestMessage(@Body() body: SendEvolutionTestMessageDto) {
    return this.evolutionService.sendText(body.phone, body.message)
  }
}
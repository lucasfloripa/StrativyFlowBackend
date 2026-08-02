import { HttpModule } from '@nestjs/axios'
import { Module, Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import {
  EVOLUTION_API_CONFIG,
  EvolutionApiConfig,
  EvolutionClient
} from './evolution.client'
import { EvolutionController } from './evolution.controller'
import { EvolutionService } from './evolution.service'

const evolutionApiConfigProvider: Provider<EvolutionApiConfig> = {
  provide: EVOLUTION_API_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): EvolutionApiConfig => ({
    baseUrl: configService.getOrThrow<string>('EVOLUTION_API_URL'),
    apiKey: configService.getOrThrow<string>('EVOLUTION_API_KEY'),
    instance: configService.getOrThrow<string>('EVOLUTION_INSTANCE')
  })
}

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [EvolutionController],
  providers: [
    evolutionApiConfigProvider,
    EvolutionClient,
    EvolutionService
  ],
  exports: [EvolutionService]
})
export class EvolutionModule {}
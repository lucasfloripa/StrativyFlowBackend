import { MODULE_METADATA } from '@nestjs/common/constants'

import { EvolutionModule } from './evolution.module'
import { EvolutionService } from './evolution.service'

describe('EvolutionModule', () => {
  it('registers no HTTP controllers', () => {
    const controllers: unknown = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      EvolutionModule
    )

    expect(controllers ?? []).toEqual([])
  })

  it('exports the Evolution service for API and worker consumers', () => {
    const exported: unknown = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      EvolutionModule
    )

    expect(exported).toEqual([EvolutionService])
  })
})

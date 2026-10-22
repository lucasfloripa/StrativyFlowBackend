import { MODULE_METADATA } from '@nestjs/common/constants'

import { StorageModule } from './storage.module'
import { StorageService } from './storage.service'

describe('StorageModule', () => {
  it('registers no HTTP controllers', () => {
    const controllers: unknown = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      StorageModule
    )

    expect(controllers ?? []).toEqual([])
  })

  it('exports the storage service for domain modules', () => {
    const exported: unknown = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      StorageModule
    )

    expect(exported).toEqual([StorageService])
  })
})

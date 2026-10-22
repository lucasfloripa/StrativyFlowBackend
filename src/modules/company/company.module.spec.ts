import { CompanyController } from './company.controller'
import { CompanyModule } from './company.module'
import { CompanyService } from './company.service'

describe('CompanyModule', () => {
  it('registers its controller, service, and repository module', () => {
    const imports: unknown = Reflect.getMetadata('imports', CompanyModule)

    expect(Reflect.getMetadata('controllers', CompanyModule)).toEqual([
      CompanyController
    ])
    expect(Reflect.getMetadata('providers', CompanyModule)).toEqual([
      CompanyService
    ])
    expect(Reflect.getMetadata('exports', CompanyModule)).toEqual([
      CompanyService
    ])
    expect(Array.isArray(imports)).toBe(true)
    expect(imports).toHaveLength(1)
  })
})

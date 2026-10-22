import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'

import { LeadsController } from './leads.controller'

type RouteDefinition = {
  handler: string
  path: unknown
  method: unknown
}

const listRoutes = (controller: { prototype: object }): RouteDefinition[] => {
  const prototype = controller.prototype as Record<string, unknown>

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = prototype[name] as object
      const path: unknown = Reflect.getMetadata(PATH_METADATA, handler)
      const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler)

      return { handler: name, path, method }
    })
}

describe('LeadsController', () => {
  describe('routes', () => {
    it('does not expose the RabbitMQ debug publish endpoint', () => {
      const routes = listRoutes(LeadsController)

      expect(routes.map((route) => route.path)).not.toContain(
        'rabbit/publish-test'
      )
      expect(routes.map((route) => route.handler)).not.toContain(
        'publishRabbitTest'
      )
    })

    it('keeps the lead CRUD routes', () => {
      const paths = listRoutes(LeadsController).map((route) => route.path)

      expect(paths).toEqual(expect.arrayContaining(['/', ':id', 'search']))
    })
  })
})
